const cloudinary = require('../config/cloudinary');
const supabaseAdmin = require('../config/supabaseAdmin');
const { protect } = require('../middleware/supabaseAuth');

/**
 * Upload profile avatar
 */
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const userId = req.user.id;

    // Upload to Cloudinary
    cloudinary.uploader.upload(
      req.file.path,
      {
        folder: 'avatars',
        public_id: `avatar_${userId}`,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      async (error, result) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: 'Failed to upload image to Cloudinary',
            error: error.message
          });
        }

        // Update user profile with avatar URL
        const { data: profile, error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update({
            avatar_url: result.secure_url,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .select()
          .single();

        if (updateError) {
          return res.status(400).json({
            success: false,
            message: 'Failed to update profile with avatar URL',
            error: updateError.message
          });
        }

        res.json({
          success: true,
          message: 'Avatar uploaded successfully',
          data: {
            avatar_url: result.secure_url
          }
        });
      }
    );
  } catch (error) {
    next(error);
  }
};
