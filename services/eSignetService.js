const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class ESignetService {
  constructor() {
    this.clientId = process.env.ESIGNET_CLIENT_ID;
    this.privateKey = process.env.ESIGNET_PRIVATE_KEY;
    this.baseUrl = process.env.ESIGNET_BASE_URL || 'https://esignet-mosipid.collab.mosip.net';
    this.redirectUri = process.env.ESIGNET_REDIRECT_URI || 'http://localhost:5000/auth/esignet-callback';
  }

  /**
   * Generate authorization URL for redirecting user to eSignet
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl() {
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'openid profile phone email',
      state: state,
      nonce: nonce,
      acr_values: 'mosip:idp:acr:generated-code', // OTP-based authentication
      display: 'page'
    });

    // Store state and nonce in session (you may want to use Redis or similar)
    // For now, returning them for the caller to manage
    return {
      url: `${this.baseUrl}/authorize?${params.toString()}`,
      state,
      nonce
    };
  }

  /**
   * Create JWT assertion for token endpoint (private_key_jwt client authentication)
   * @returns {string} JWT assertion
   */
  createClientAssertion() {
    const now = Math.floor(Date.now() / 1000);
    const tokenEndpoint = `${this.baseUrl}/v1/esignet/oauth/v2/token`;

    const payload = {
      iss: this.clientId,
      sub: this.clientId,
      aud: tokenEndpoint,
      iat: now,
      exp: now + 300, // 5 minutes expiry
      jti: crypto.randomBytes(16).toString('hex')
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      keyid: 'esignet-key' // Optional: key ID if eSignet has multiple keys
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} authorizationCode - Code from callback
   * @returns {Promise<{accessToken, idToken, expiresIn}>}
   */
  async exchangeCodeForTokens(authorizationCode) {
    try {
      const clientAssertion = this.createClientAssertion();
      const tokenEndpoint = `${this.baseUrl}/v1/esignet/oauth/v2/token`;

      const response = await axios.post(
        tokenEndpoint,
        {
          grant_type: 'authorization_code',
          code: authorizationCode,
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          client_assertion: clientAssertion
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        idToken: response.data.id_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } catch (error) {
      console.error('❌ Error exchanging code for tokens:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  /**
   * Fetch eSignet public keys for JWT verification
   * @returns {Promise<Array>} Array of public keys in JWK format
   */
  async getPublicKeys() {
    try {
      const jwksEndpoint = `${this.baseUrl}/.well-known/jwks.json`;
      const response = await axios.get(jwksEndpoint);
      return response.data.keys;
    } catch (error) {
      console.error('❌ Error fetching public keys:', error.message);
      throw new Error('Failed to fetch eSignet public keys');
    }
  }

  /**
   * Verify JWT signature using eSignet's public key
   * @param {string} token - JWT token to verify
   * @returns {Promise<object>} Decoded token payload
   */
  async verifyToken(token) {
    try {
      const publicKeys = await this.getPublicKeys();
      
      // Decode header to find the kid (key ID)
      const decoded = jwt.decode(token, { complete: true });
      const kid = decoded.header.kid;

      // Find the matching public key
      const publicKeyObj = publicKeys.find(key => key.kid === kid);
      if (!publicKeyObj) {
        throw new Error('Public key not found for token');
      }

      // Convert JWK to PEM format
      const publicKeyPem = this.jwkToPem(publicKeyObj);

      // Verify and decode
      const verified = jwt.verify(token, publicKeyPem, {
        algorithms: ['RS256']
      });

      return verified;
    } catch (error) {
      console.error('❌ Error verifying token:', error.message);
      throw new Error('Failed to verify token signature');
    }
  }

  /**
   * Fetch user information using access token
   * @param {string} accessToken - Access token from token endpoint
   * @returns {Promise<object>} User claims (name, email, phone, etc.)
   */
  async getUserInfo(accessToken) {
    try {
      const userinfoEndpoint = `${this.baseUrl}/v1/esignet/oidc/userinfo`;
      
      const response = await axios.get(userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // eSignet returns userinfo as a JWT, so we need to verify it
      const userInfoJwt = response.data;
      
      if (typeof userInfoJwt === 'string') {
        // It's a JWT, verify and decode
        const userClaims = await this.verifyToken(userInfoJwt);
        return userClaims;
      } else {
        // Already decoded (in some cases)
        return userInfoJwt;
      }
    } catch (error) {
      console.error('❌ Error fetching user info:', error.message);
      throw new Error('Failed to fetch user information');
    }
  }

  /**
   * Convert JWK (JSON Web Key) to PEM format for JWT verification
   * @param {object} jwk - JWK object
   * @returns {string} PEM formatted public key
   */
  jwkToPem(jwk) {
    try {
      const { kty, n, e } = jwk;
      
      if (kty !== 'RSA') {
        throw new Error('Only RSA keys are supported');
      }

      // Convert base64url to base64
      const base64url = str => str
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      const base64 = str => str
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(str.length + (4 - str.length % 4) % 4, '=');

      // Decode modulus and exponent
      const nBuffer = Buffer.from(base64(n), 'base64');
      const eBuffer = Buffer.from(base64(e), 'base64');

      // Create RSA key object using crypto
      const publicKey = crypto.createPublicKey({
        key: {
          kty: 'RSA',
          n: nBuffer,
          e: eBuffer
        },
        format: 'jwk'
      });

      return publicKey.export({ format: 'pem', type: 'spki' });
    } catch (error) {
      console.error('❌ Error converting JWK to PEM:', error.message);
      throw new Error('Failed to convert JWK to PEM');
    }
  }

  /**
   * Complete OAuth flow: exchange code and get user info
   * @param {string} authorizationCode - Authorization code from callback
   * @returns {Promise<object>} User information
   */
  async authenticateUser(authorizationCode) {
    try {
      console.log('📝 Exchanging authorization code for tokens...');
      const tokens = await this.exchangeCodeForTokens(authorizationCode);

      console.log('✅ Tokens received. Verifying ID token...');
      const idTokenPayload = await this.verifyToken(tokens.idToken);

      console.log('✅ ID token verified. Fetching user info...');
      const userInfo = await this.getUserInfo(tokens.accessToken);

      console.log('✅ User authenticated successfully');
      return {
        sub: userInfo.sub,
        name: userInfo.name,
        email: userInfo.email,
        phone: userInfo.phone,
        address: userInfo.address,
        individualId: userInfo.individual_id, // National ID
        idTokenPayload,
        userInfo
      };
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw error;
    }
  }
}

module.exports = new ESignetService();
