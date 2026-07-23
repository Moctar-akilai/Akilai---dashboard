/**
 * twilio-rdv.js — helper partagé pour les crons RDV.
 * Gère l'envoi SMS et/ou WhatsApp selon le champ "Canal feedback" du salon.
 *
 * Env vars :
 *   TWILIO_ACCOUNT_SID    — SID du compte Twilio
 *   TWILIO_AUTH_TOKEN     — token d'auth Twilio
 *   TWILIO_FROM_NUMBER    — numéro expéditeur SMS (ex: +33XXXXXXXXX)
 *   TWILIO_WHATSAPP_NUMBER — numéro WhatsApp Twilio (ex: +14155238886 pour sandbox)
 */

const SID      = process.env.TWILIO_ACCOUNT_SID;
const AUTH     = process.env.TWILIO_AUTH_TOKEN;
const FROM_SMS = process.env.TWILIO_FROM_NUMBER;
const FROM_WA  = process.env.TWILIO_WHATSAPP_NUMBER;

function toWaAddr(number) {
  return number.startsWith("whatsapp:") ? number : `whatsapp:${number}`;
}

async function twilioPost(from, to, body) {
  if (!SID || !AUTH) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN non configurés");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Basic ${Buffer.from(`${SID}:${AUTH}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    }
  );
  const d = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${d.message}`);
  return d.sid;
}

/**
 * Envoie un message SMS et/ou WhatsApp selon le canal du salon.
 * @param {string} tel     — numéro destinataire (E.164, ex: +33612345678)
 * @param {string} message — corps du message
 * @param {string} canal   — "SMS" | "WhatsApp" | "Les deux"
 * @returns {Promise<string[]>} SIDs Twilio envoyés
 */
async function sendRdvMessage(tel, message, canal) {
  if (!SID || !AUTH) {
    console.warn("[twilio-rdv] Twilio non configuré — message ignoré");
    return [];
  }
  if (!tel) throw new Error("Numéro de téléphone manquant");

  const c = (canal || "SMS").toLowerCase();
  const doSms = c === "sms" || c === "les deux";
  const doWa  = c === "whatsapp" || c === "les deux";
  const sids  = [];

  if (doSms) {
    if (!FROM_SMS) { console.warn("[twilio-rdv] TWILIO_FROM_NUMBER manquant"); }
    else { sids.push(await twilioPost(FROM_SMS, tel, message)); }
  }
  if (doWa) {
    if (!FROM_WA) { console.warn("[twilio-rdv] TWILIO_WHATSAPP_NUMBER manquant"); }
    else { sids.push(await twilioPost(toWaAddr(FROM_WA), toWaAddr(tel), message)); }
  }
  return sids;
}

module.exports = { sendRdvMessage };
