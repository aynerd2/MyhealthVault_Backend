const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK with your credentials
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  signatureVersion: 'v4',
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'health-vault-documents';

/**
 * S3 SERVICE
 * This handles all file operations with Amazon S3
 * 
 * Why S3?
 * - Secure storage for medical documents
 * - Automatic encryption
 * - Reliable and scalable
 * - Easy to manage permissions
 */

class S3Service {
  /**
   * UPLOAD FILE TO S3
   * Saves a file to Amazon S3 cloud storage
   * 
   * Parameters:
   * @param {object} file - File from multer (req.file)
   * @param {string} patientId - Patient's ID for organizing files
   * @param {string} folder - Folder name ('test-results', 'medical-records', etc.)
   * @returns {string} URL of the uploaded file
   * 
   * Example:
   * const url = await S3Service.uploadFile(req.file, '123abc', 'test-results');
   */
  static async uploadFile(file, patientId, folder = 'test-results') {
    try {
      // Step 1: Create a unique filename
      const fileExtension = file.originalname.split('.').pop() || 'bin';
      const fileName = `${uuidv4()}.${fileExtension}`; // e.g., "abc-123-def.pdf"
      const key = `${folder}/${patientId}/${fileName}`; // Full path in S3

      // Step 2: Prepare upload parameters
      const params = {
        Bucket: BUCKET_NAME, // Your S3 bucket name
        Key: key, // File path in bucket
        Body: file.buffer, // File data
        ContentType: file.mimetype, // File type (e.g., 'application/pdf')
        ServerSideEncryption: 'AES256', // Encrypt the file
        Metadata: {
          // Extra information about the file
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          patientId: patientId,
        },
      };

      // Step 3: Upload to S3
      const result = await s3.upload(params).promise();

      console.log(`✅ File uploaded to S3: ${key}`);
      return result.Location; // Returns the URL
    } catch (error) {
      console.error('❌ S3 upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * GET SIGNED URL
   * Creates a temporary link to download a file
   * (For security, S3 files are private and need signed URLs)
   * 
   * Parameters:
   * @param {string} fileUrl - Full S3 URL or just the key
   * @param {number} expiresIn - How long the link is valid (in seconds)
   * @returns {string} Temporary download URL
   * 
   * Example:
   * const downloadUrl = await S3Service.getSignedUrl(fileUrl, 3600); // Valid for 1 hour
   */
  static async getSignedUrl(fileUrl, expiresIn = 3600) {
    try {
      // Extract the key from full URL if needed
      let key;
      
      if (fileUrl.startsWith('http')) {
        const url = new URL(fileUrl);
        key = url.pathname.substring(1); // Remove leading '/'
      } else {
        key = fileUrl;
      }

      const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: expiresIn,
      };

      // Generate the signed URL
      const signedUrl = await s3.getSignedUrlPromise('getObject', params);
      return signedUrl;
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      throw new Error(`Failed to generate download link: ${error.message}`);
    }
  }

  /**
   * DELETE FILE FROM S3
   * Removes a file from storage
   * 
   * Parameters:
   * @param {string} fileUrl - Full S3 URL or just the key
   * 
   * Example:
   * await S3Service.deleteFile('https://bucket.s3.amazonaws.com/file.pdf');
   */
  static async deleteFile(fileUrl) {
    try {
      // Extract key from URL
      let key;
      
      if (fileUrl.startsWith('http')) {
        const url = new URL(fileUrl);
        key = url.pathname.substring(1);
      } else {
        key = fileUrl;
      }

      const params = {
        Bucket: BUCKET_NAME,
        Key: key,
      };

      await s3.deleteObject(params).promise();
      console.log(`✅ File deleted from S3: ${key}`);
    } catch (error) {
      console.error('❌ S3 delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * CHECK IF FILE EXISTS
   * Verifies if a file is in S3
   * 
   * Parameters:
   * @param {string} fileUrl - Full S3 URL or just the key
   * @returns {boolean} true if exists, false if not
   */
  static async fileExists(fileUrl) {
    try {
      let key;
      
      if (fileUrl.startsWith('http')) {
        const url = new URL(fileUrl);
        key = url.pathname.substring(1);
      } else {
        key = fileUrl;
      }

      await s3.headObject({
        Bucket: BUCKET_NAME,
        Key: key,
      }).promise();

      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * VALIDATE FILE TYPE
   * Checks if the file type is allowed
   * 
   * Parameters:
   * @param {string} mimetype - File MIME type (e.g., 'application/pdf')
   * @returns {boolean} true if valid, false if not
   */
  static isValidFileType(mimetype) {
    const allowedTypes = [
      'application/pdf', // PDF documents
      'image/jpeg', // JPEG images
      'image/jpg', // JPG images
      'image/png', // PNG images
      'image/gif', // GIF images
      'application/msword', // Word documents (.doc)
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word (.docx)
    ];

    return allowedTypes.includes(mimetype);
  }

  /**
   * FORMAT FILE SIZE
   * Converts bytes to human-readable format
   * 
   * Parameters:
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted string (e.g., "2.5 MB")
   * 
   * Example:
   * S3Service.formatFileSize(2500000); // Returns "2.38 MB"
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = S3Service;