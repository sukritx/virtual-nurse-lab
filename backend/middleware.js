const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No token provided');
        return res.status(403).json({ message: "Forbidden: No token provided" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        console.error("Authentication error:", err);
        return res.status(403).json({ message: "Forbidden: Invalid token" });
    }
};

const professorAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No token provided');
        return res.status(403).json({ message: "Forbidden: No token provided" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.isProfessor) {
            console.log('Not a professor');
            return res.status(403).json({ message: "Forbidden: Not a professor" });
        }

        req.userId = decoded.userId;
        next();
    } catch (err) {
        console.error("Professor authorization error:", err);
        return res.status(403).json({ message: "Forbidden: Invalid token" });
    }
};

const adminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No token provided');
        return res.status(403).json({ message: "Forbidden: No token provided" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.isAdmin) {
            console.log('Not an admin');
            return res.status(403).json({ message: "Forbidden: Not an admin" });
        }

        req.userId = decoded.userId;
        next();
    } catch (err) {
        console.error("Admin authorization error:", err);
        return res.status(403).json({ message: "Forbidden: Invalid token" });
    }
};

// Middleware to handle file size error
function fileSizeErrorHandler(err, req, res, next) {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Error: Video is too large, please upload a file smaller than 500MB' });
    }
    next(err);
}

module.exports = {
    authMiddleware,
    professorAuth,
    adminAuth,
    fileSizeErrorHandler
};
