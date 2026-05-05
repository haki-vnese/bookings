class ApiError extends Error {
    constructor(statusCode, message, options = {}) {
        super(message);
        this.name = this.constructor.name;
        this.status = statusCode;
        this.expose = options.expose ?? statusCode < 500; // Whether to expose the message to the client   
        this.details = options.details || null; // Optional additional details for debugging
    }
}

export default ApiError;