export const notifySaved = (message = '정산이 저장되었습니다.') => window.dispatchEvent(new window.CustomEvent('settlement-saved', { detail: message }))
