import nodemailer from 'nodemailer'
import { appEnv } from '@/config/env'

interface EmailOptions {
  to: string
  subject: string
  text: string
  html: string
}

let transporter: nodemailer.Transporter | null = null

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) return transporter

  // Skip email setup if SMTP is not configured
  if (!appEnv.smtpHost || !appEnv.smtpUser) {
    console.warn('[email] SMTP not configured, email sending disabled')
    return null
  }

  transporter = nodemailer.createTransport({
    host: appEnv.smtpHost,
    port: appEnv.smtpPort,
    secure: appEnv.smtpSecure,
    auth: {
      user: appEnv.smtpUser,
      pass: appEnv.smtpPass,
    },
  })

  return transporter
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const transport = getTransporter()

  if (!transport) {
    console.log('[email] Would send email:', {
      to: options.to,
      subject: options.subject,
    })
    // In development without SMTP, log the email content
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] Email content (dev mode):', options.text)
    }
    return true // Return true in dev to not block flows
  }

  try {
    await transport.sendMail({
      from: appEnv.smtpFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })
    console.log('[email] Sent email to:', options.to)
    return true
  } catch (error) {
    console.error('[email] Failed to send email:', error)
    return false
  }
}

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  displayName: string,
): Promise<boolean> => {
  const resetUrl = `${appEnv.appUrl}/reset-password?token=${resetToken}`

  const text = `Hi ${displayName},

You requested to reset your password for Only Tactics.

Click here to reset your password: ${resetUrl}

This link will expire in ${appEnv.passwordResetExpiresMinutes} minutes.

If you didn't request this, you can safely ignore this email.

- The Only Tactics Team`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { color: #666; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Reset Your Password</h2>
    <p>Hi ${displayName},</p>
    <p>You requested to reset your password for Only Tactics.</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p>Or copy and paste this link: <br><code>${resetUrl}</code></p>
    <p>This link will expire in ${appEnv.passwordResetExpiresMinutes} minutes.</p>
    <p class="footer">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`

  return sendEmail({
    to: email,
    subject: 'Reset Your Password - Only Tactics',
    text,
    html,
  })
}

export const sendWelcomeEmail = async (
  email: string,
  displayName: string,
): Promise<boolean> => {
  const text = `Welcome to Only Tactics, ${displayName}!

Your account has been created successfully. You can now log in and start racing.

Visit: ${appEnv.appUrl}

- The Only Tactics Team`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Welcome to Only Tactics!</h2>
    <p>Hi ${displayName},</p>
    <p>Your account has been created successfully. You can now log in and start racing.</p>
    <a href="${appEnv.appUrl}" class="button">Start Racing</a>
  </div>
</body>
</html>`

  return sendEmail({
    to: email,
    subject: 'Welcome to Only Tactics!',
    text,
    html,
  })
}

export const sendAdminPasswordResetEmail = async (
  email: string,
  temporaryPassword: string,
  displayName: string,
): Promise<boolean> => {
  const text = `Hi ${displayName},

An administrator has reset your password for Only Tactics.

Your temporary password is: ${temporaryPassword}

Please log in and change your password immediately.

Login here: ${appEnv.appUrl}/login

- The Only Tactics Team`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .password { background: #f3f4f6; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 18px; }
    .warning { color: #dc2626; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Password Reset by Administrator</h2>
    <p>Hi ${displayName},</p>
    <p>An administrator has reset your password for Only Tactics.</p>
    <p>Your temporary password is:</p>
    <p class="password">${temporaryPassword}</p>
    <p class="warning">Please log in and change your password immediately.</p>
    <a href="${appEnv.appUrl}/login" class="button">Log In</a>
  </div>
</body>
</html>`

  return sendEmail({
    to: email,
    subject: 'Your Password Has Been Reset - Only Tactics',
    text,
    html,
  })
}
