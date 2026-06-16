exports.handler = async function() {
  const key = process.env.VAPI_PUBLIC_KEY;
  if (!key) {
    return { statusCode: 404, body: JSON.stringify({ ok: false, error: "VAPI_PUBLIC_KEY non configurée" }) };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, publicKey: key }),
  };
};
