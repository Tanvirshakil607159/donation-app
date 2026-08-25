const test = async () => {
  try {
    const res = await fetch("https://ocfdnzokcbdzpnmxahtp.supabase.co/functions/v1/payment-init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmRuem9rY2JkenBubXhhaHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDA3MzIsImV4cCI6MjEwMjIxNjczMn0.WeVPB0Q0rqH2roewdG44-eDxs-X-gmw55bxK9hhFdqE`
      },
      body: JSON.stringify({
        member_code: "U13-001",
        phone: "01700000000",
        amount: 500,
        donation_months: ["2023-10"]
      })
    });
    
    console.log("Status:", res.status);
    console.log("Text:", await res.text());
  } catch (e) {
    console.error(e);
  }
};
test();
