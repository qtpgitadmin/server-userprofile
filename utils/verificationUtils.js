import crypto from 'crypto';

class VerificationUtils {
  // Generate a random 6-digit verification code
  static generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Extract domain from email
  static extractDomain(email) {
    return email.split('@')[1].toLowerCase();
  }

  // Check if company name matches email domain
  static checkDomainMatch(companyName, email) {
    const domain = this.extractDomain(email);
    const cleanCompanyName = companyName.toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove special characters and spaces
      .replace(/inc|ltd|llc|corp|corporation|company|co/g, ''); // Remove common company suffixes

    // Extract main domain name (without TLD)
    const domainName = domain.split('.')[0];

    // Check various matching patterns
    const patterns = [
      cleanCompanyName === domainName,
      cleanCompanyName.includes(domainName),
      domainName.includes(cleanCompanyName),
      // Check if company name is part of domain (e.g., "tech corp" matches "techcorp.com")
      cleanCompanyName.replace(/\s+/g, '') === domainName,
      // Check similarity for common variations
      this.calculateSimilarity(cleanCompanyName, domainName) > 0.8
    ];

    return patterns.some(pattern => pattern);
  }

  // Calculate string similarity using Levenshtein distance
  static calculateSimilarity(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Initialize matrix
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len2][len1]) / maxLen;
  }

  // Validate verification code format
  static isValidCode(code) {
    return /^\d{6}$/.test(code);
  }

  // Check if verification has expired
  static isExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
  }

  // Generate verification expiry time (10 minutes from now)
  static generateExpiryTime() {
    const now = new Date();
    return new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
  }
}

export default VerificationUtils;