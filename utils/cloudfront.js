import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import fs from 'fs/promises';
import path from 'path';

const REGION = process.env.AWS_REGION || 'ap-south-1';
const PRIVATE_KEY_PATH = process.env.CLOUDFRONT_PRIVATE_KEY_PATH || path.join(process.cwd(), 'cloudfront_private_key.pem');

export async function getPrivateKey() {
  try {
    const key = await fs.readFile(PRIVATE_KEY_PATH, 'utf-8');
    if (key.includes('\\n')) {
      // Handle escaped newlines if the key is stored with them
      return key.replace(/\\n/g, '\n').trim();
    }
    // If the key is already in the correct format, just trim it
    return key.trim();
  } catch (error) {
    console.error('Error reading CloudFront private key:', error);
    throw new Error('Failed to read CloudFront private key file');
  }
}

export async function generateSignedUrl(s3ObjectKey) {
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error('CloudFront private key could not be retrieved');
  const keyPairId = process.env.CLOUDFRONT_KEY_ID;
  if (!keyPairId) throw new Error('CLOUDFRONT_KEY_ID environment variable is not set');
  const cloudfrontMediaDomain = process.env.CLOUDFRONT_MEDIA_DOMAIN_NAME || 'https://media.dintak.com';
  const url = `${cloudfrontMediaDomain.replace(/\/$/, '')}/${s3ObjectKey.replace(/^\//, '')}`;
  const expiresInSeconds = 60 * 60 * 10; // 10 hours
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;

  console.log({
    url,
    keyPairId,
    privateKey: privateKey ? '[REDACTED]' : undefined,
    expires
  });

  return getCloudFrontSignedUrl({
    url,
    keyPairId,
    privateKey,
    dateLessThan: expires
  });
}

export async function getUrl(s3ObjectKey) {
  const cloudfrontMediaDomain = process.env.CLOUDFRONT_MEDIA_DOMAIN_NAME || 'https://media.dintak.com';
  const url = `${cloudfrontMediaDomain.replace(/\/$/, '')}/${s3ObjectKey.replace(/^\//, '')}`;
 
 
  return url
}

