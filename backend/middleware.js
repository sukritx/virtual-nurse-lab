const { JWT_SECRET } = require("./config");
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No token provided');
        return res.status(403).json({ message: "Forbidden: No token provided" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
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

module.exports = {
    authMiddleware,
    professorAuth,
    adminAuth
};
