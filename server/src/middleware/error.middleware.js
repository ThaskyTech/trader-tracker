import { ZodError, z } from 'zod'

// Throw this from any route to send a clean error response:
//   throw new HttpError(404, 'Trade not found.')
// Express 5 passes errors thrown in async handlers to errorHandler below,
// so controllers don't need their own try/catch.
export class HttpError extends Error {
    constructor(status, message, details){
        super(message)
        this.status = status
        this.details = details
    }
}

// Turns a zod error into a readable message plus per-field details, which a form can show next to each input.
export function validationError(zodError){
    const first = zodError.issues[0]
    const field = first?.path?.length ? `${first.path.join('.')}: ` : ''
    return new HttpError(400, `${field}${first?.message ?? 'Invalid input.'}`, z.flattenError(zodError).fieldErrors)
}

export function notFound(req, res){
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}

// eslint-disable-next-line no-unused-vars -- Express only treats it as an error handler with exactly 4 arguments.
export function errorHandler(err, req, res, next){
    if(err instanceof ZodError) err = validationError(err)

    if(err instanceof HttpError){
        return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) })
    }

    // Errors from express.json(), such as malformed JSON or a body that is too large.
    // `expose` marks the message as safe to show the client.
    if(err.expose && err.status){
        const message = err.type === 'entity.parse.failed' ? 'Request body is not valid JSON.' : err.message
        return res.status(err.status).json({ error: message })
    }

    console.error(`${req.method} ${req.originalUrl} failed:`, err)
    res.status(500).json({ error: 'Something went wrong on the server.' })
}
