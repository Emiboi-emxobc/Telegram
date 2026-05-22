const sharp =
  require('sharp');

const streamifier =
  require('streamifier');

const cloudinary =
  require('./cloudinary.service');

exports.uploadImage =
  async file => {
    const buffer =
      await sharp(file.buffer)
        .resize({
          width: 1200,
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
              folder:
                'marsdove'
            },

            (error, result) => {
              if (error)
                return reject(error);

              resolve(result);
            }
          );

        streamifier
          .createReadStream(buffer)
          .pipe(stream);
      }
    );
  };