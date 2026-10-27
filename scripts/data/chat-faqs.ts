/**
 * Starter questions for the inquiry bot. Edit them later from Admin -> Chat & bot.
 * {cancel_hours}, {cancel_percent}, {phone} and {whatsapp} are filled in from the settings when the bot answers.
 */
export const CHAT_FAQS = [
  {
    questionAr: "كيف أحجز رحلة؟",
    questionEn: "How do I book a ride?",
    answerAr: "من الصفحة الرئيسية اختر «توصيل» أو «بالساعة مع سائق»، ثم حدّد من وإلى والتاريخ والوقت واضغط «اعرض الأسعار». اختر السيارة واكتب بياناتك ثم ادفع، ويصلك رقم الحجز مباشرة.",
    answerEn: "On the home page choose Transfer or Hourly with driver, pick from, to, date and time, then tap Show prices. Choose a car, enter your details and pay; you get your booking number right away.",
    keywords: "حجز, احجز, طريقة الحجز, ابغى احجز, booking, book",
  },
  {
    questionAr: "ما طرق الدفع المتاحة؟",
    questionEn: "How can I pay?",
    answerAr: "الدفع عبر ماي فاتورة (بطاقة أو محفظة إلكترونية)، أو بالتحويل البنكي: تظهر لك بيانات الحساب، وترفع صورة الإيصال في صفحة حجزك، ونؤكد الحجز بعد وصول المبلغ.",
    answerEn: "Pay online through MyFatoorah, or by bank transfer: you'll see our account details, upload the receipt on your booking page, and we confirm once the money arrives.",
    keywords: "دفع, الدفع, تحويل, بنك, ايبان, بطاقه, مدى, فاتورة, payment, pay, transfer, card",
  },
  {
    questionAr: "ما سياسة الإلغاء والاسترداد؟",
    questionEn: "What is the cancellation policy?",
    answerAr: "تقدر تلغي من صفحة حجزك قبل موعد الاستلام. يُسترد المبلغ كاملًا إذا ألغيت قبل الموعد بـ{cancel_hours} ساعة أو أكثر، و{cancel_percent}٪ إذا ألغيت بعد ذلك. يعود المبلغ لنفس طريقة الدفع.",
    answerEn: "You can cancel from your booking page before pickup. Full refund if you cancel at least {cancel_hours} hours before pickup, {cancel_percent}% after that. The money goes back the way you paid.",
    keywords: "الغاء, الغي, استرداد, ارجاع المبلغ, refund, cancel",
  },
  {
    questionAr: "هل السعر للسيارة أو للشخص؟",
    questionEn: "Is the price per car or per person?",
    answerAr: "السعر للسيارة كاملة وليس للراكب، ويشمل الوقود ورسوم الطرق. تُضاف ضريبة القيمة المضافة ١٥٪ عند الدفع.",
    answerEn: "Prices are for the whole car, not per passenger, and include fuel and road fees. 15% VAT is added at payment.",
    keywords: "سعر, السعر, كم, تكلفه, الشخص, الراكب, ضريبه, price, cost, vat",
  },
  {
    questionAr: "كيف يعمل الحجز بالساعة؟",
    questionEn: "How does hourly booking work?",
    answerAr: "تحجز سيارة مع سائق ٦ أو ١٢ أو ٢٤ ساعة. تبدأ المدة من وقت الاستلام، والسائق معك طوال المدة ويتنقل بك بين الأماكن التي تريدها.",
    answerEn: "Book a car with a driver for 6, 12 or 24 hours. Time starts at pickup and the driver stays with you, taking you wherever you need.",
    keywords: "ساعه, ساعات, بالساعه, سائق خاص, hourly, hours, driver",
  },
  {
    questionAr: "كيف أعرف حالة حجزي؟",
    questionEn: "How do I check my booking?",
    answerAr: "افتح «حجزي» من أعلى الصفحة واكتب رقم الحجز المكوّن من ٨ خانات، وتظهر لك حالة الحجز والدفع.",
    answerEn: "Open My booking at the top of the page and enter your 8-character booking number to see its status.",
    keywords: "حالة, حجزي, رقم الحجز, وين حجزي, status, my booking",
  },
  {
    questionAr: "هل أقدر أغيّر موعد الرحلة؟",
    questionEn: "Can I change my pickup time?",
    answerAr: "نعم، مرة واحدة مجانًا قبل الموعد بـ١٢ ساعة على الأقل. تكلم مع موظف من هنا أو اتصل بنا على {phone}.",
    answerEn: "Yes, once for free at least 12 hours before pickup. Talk to a staff member here or call us on {phone}.",
    keywords: "تغيير, تعديل, اغير, موعد, الوقت, change, reschedule, time",
  },
];

export const CHAT_SETTINGS: Record<string, string> = {
  chat_enabled: "1",
  chat_bot_name_ar: "مساعد رحلة",
  chat_bot_name_en: "Rihla assistant",
  chat_greeting_ar: "أهلًا بك! أنا المساعد الآلي. اختر سؤالًا من الأسفل أو اكتب سؤالك، وإذا احتجت تقدر تكلم موظف مباشرة.",
  chat_greeting_en: "Hi! I'm the assistant. Pick a question below or type yours, and you can talk to a staff member any time.",
  chat_fallback_ar: "ما لقيت إجابة دقيقة لسؤالك. اختر من الأسئلة، أو اضغط «تكلم مع موظف».",
  chat_fallback_en: "I couldn't find an exact answer. Pick one of the questions, or tap Talk to a staff member.",
  // live: chat with staff here on the site; whatsapp: hand over to WhatsApp; both; off
  chat_handoff: "both",
  chat_waiting_ar: "وصل طلبك لموظف خدمة العملاء، وبيرد عليك هنا خلال دقائق. خلّ هذه النافذة مفتوحة أو ارجع لها لاحقًا.",
  chat_waiting_en: "Your request reached our team; a staff member will reply here shortly. Keep this window open or come back later.",
};
