import crypto from 'node:crypto'

// Broker credentials at rest (D-15, D-67): AES-256-GCM with a key that lives only in
// the ENCRYPTION_KEY environment variable, never in the database.
//
// Stored as "v1:<iv>:<tag>:<ciphertext>" (base64). The version prefix lets the key be
// rotated later: a v2 can be added and old rows re-encrypted without guessing formats.
// GCM's tag means a tampered or wrongly-keyed value fails loudly instead of decrypting
// to garbage. The account id is bound in as "additional data", so a ciphertext copied
// onto another account's row won't decrypt there.
//
// If ENCRYPTION_KEY is lost, stored keys can't be recovered: each account has to be
// reconnected. Keep a copy in a password manager.

const VERSION = 'v1'
const IV_BYTES = 12 // the size GCM is designed for

export class EncryptionNotConfiguredError extends Error {}

function loadKey(){
    const raw = process.env.ENCRYPTION_KEY
    if(!raw) throw new EncryptionNotConfiguredError('ENCRYPTION_KEY is not set.')
    const key = Buffer.from(raw, 'base64')
    if(key.length !== 32) throw new EncryptionNotConfiguredError('ENCRYPTION_KEY must be 32 random bytes, base64-encoded.')
    return key
}

export function isEncryptionConfigured(){
    try { loadKey(); return true } catch { return false }
}

// value: any JSON-serialisable object, e.g. { apiKey, apiSecret }.
export function encryptCredentials(value, accountId){
    const iv = crypto.randomBytes(IV_BYTES)
    const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv)
    cipher.setAAD(Buffer.from(accountId))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return [VERSION, iv, cipher.getAuthTag(), ciphertext].map(part => typeof part === 'string' ? part : part.toString('base64')).join(':')
}

export function decryptCredentials(payload, accountId){
    const [version, iv, tag, ciphertext] = String(payload).split(':')
    if(version !== VERSION || !ciphertext) throw new Error('Unrecognised credential format.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'))
    decipher.setAAD(Buffer.from(accountId))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()])
    return JSON.parse(plaintext.toString('utf8'))
}

// What the browser may see instead of the key (D-16): enough to recognise which key
// is connected, nothing that helps use it.
export const maskKey = key => `••••${String(key).slice(-4)}`
