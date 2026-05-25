const multer =
  require('multer');

const ApiError =
  require('../helpers/ApiError');

/* ======================
   MEMORY STORAGE
====================== */

const storage =
  multer.memoryStorage();

/* ======================
   FILE FILTER
====================== */

function fileFilter(
  req,
  file,
  cb
) {

  const allowed =
    [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

  if (
    !allowed.includes(
      file.mimetype
    )
  ) {

    return cb(
      new ApiError(
        400,
        'Invalid image format'
      ),
      false
    );

  }

  cb(null, true);

}

/* ======================
   MULTER
====================== */

module.exports =
  multer({

    storage,

    fileFilter,

    limits: {
      fileSize:
        5 *
        1024 *
        1024
    }

  });