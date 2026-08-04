const multer = require('multer');

// Configure memory storage
const storage = multer.memoryStorage();

// File filter to allow only spreadsheet files
const fileFilter = (req, file, cb) => {
  const filetypes = /csv|xlsx|xls|vnd.openxmlformats-officedocument.spreadsheetml.sheet|vnd.ms-excel/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(file.originalname.toLowerCase());

  if (mimetype || extname) {
    return cb(null, true);
  }
  
  cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed!'), false);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

module.exports = upload;
