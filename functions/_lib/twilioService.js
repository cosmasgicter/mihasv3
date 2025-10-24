const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER

export async function sendSMS({ to, message }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('Twilio not configured')
    return { success: false, error: 'SMS service not configured' }
  }

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: to,
          From: TWILIO_PHONE_NUMBER,
          Body: message
        })
      }
    )

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to send SMS')
    }

    return { success: true, sid: data.sid }
  } catch (error) {
    console.error('SMS error:', error)
    return { success: false, error: error.message }
  }
}

export async function sendWhatsApp({ to, message }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('Twilio not configured')
    return { success: false, error: 'WhatsApp service not configured' }
  }

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
    const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: whatsappTo,
          From: TWILIO_WHATSAPP_NUMBER || `whatsapp:${TWILIO_PHONE_NUMBER}`,
          Body: message
        })
      }
    )

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to send WhatsApp')
    }

    return { success: true, sid: data.sid }
  } catch (error) {
    console.error('WhatsApp error:', error)
    return { success: false, error: error.message }
  }
}
