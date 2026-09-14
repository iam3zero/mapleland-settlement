// Replace this adapter with server authentication when moving beyond browser-local records.
// Web Crypto PBKDF2: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
const ITERATIONS = 600000
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const unhex = text => Uint8Array.from(text.match(/../g), byte => parseInt(byte, 16))

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('비밀번호 보호에는 HTTPS 또는 localhost 환경이 필요합니다.')
  return globalThis.crypto
}

async function derive(password, salt, iterations) {
  const api = webCrypto()
  const key = await api.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await api.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

export async function protectPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('비밀번호는 8~128자로 설정해주세요.')
  const salt = webCrypto().getRandomValues(new Uint8Array(16))
  return { algorithm: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: hex(salt), hash: hex(await derive(password, salt, ITERATIONS)) }
}

export function validProtection(protection) {
  return protection?.algorithm === 'PBKDF2-SHA256' && protection.iterations === ITERATIONS && /^[a-f0-9]{32}$/.test(protection.salt) && /^[a-f0-9]{64}$/.test(protection.hash)
}

export async function verifyPassword(password, protection) {
  if (!validProtection(protection) || typeof password !== 'string' || password.length > 128) return false
  const actual = await derive(password, unhex(protection.salt), protection.iterations)
  const expected = unhex(protection.hash)
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index]
  return difference === 0
}
