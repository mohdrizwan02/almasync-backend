import multer from 'multer'

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../public/temp')
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now())
    }
})

export const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
})