const sharp =
  require('sharp');

const streamifier =
  require('streamifier');

const cloudinary =
  require('../config/cloudinary');

module.exports =
  async function uploadImage(
    file,
    folder =
      'marsdove'
  ) {

    const optimizedBuffer =
      await sharp(file.buffer)

        .resize({
          width: 1600,
          withoutEnlargement: true
        })

        .webp({
          quality: 80
        })

        .toBuffer();

    return new Promise(
      (resolve, reject) => {

        const stream =
          cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type:
                'image'
            },

            (
              error,
              result
            ) => {

              if (error) {
                return reject(
                  error
                );
              }

              resolve(result);

            }
          );

        streamifier
          .createReadStream(
            optimizedBuffer
          )
          .pipe(stream);

      }
    );

  };