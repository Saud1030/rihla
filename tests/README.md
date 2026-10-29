# الاختبارات الشاملة

١٣٥ اختبارًا تغطي: الحجز والدفع كاملًا عبر ماي فاتورة، محاولات التلاعب بالمبالغ والـ Webhook،
انقطاع بوابة الدفع، تزامن الإشعارات، أمان لوحة التحكم، كل عمليات الإدارة، الوجهات والتسعير بالمسافة، ضريبة القيمة المضافة، المظهر ورفع الشعار، اختيار الوجهة باللمس، الحجز بالساعة، إلغاء العميل والاسترداد، إخفاء وحذف الوجهات، التحويل البنكي، التاريخ والوقت ووقت الانتهاء، الشريط العلوي وصفحة التواصل، رفع الإيصالات، البوت والمحادثة المباشرة، البنرات وخلفية الصفحة الرئيسية، الجوال، سهولة الوصول، والضغط.

الاختبارات تستخدم **نسخة محاكاة من ماي فاتورة** (`mock-myfatoorah.mjs`) فلا تحتاج حسابًا حقيقيًا ولا تُنشئ مدفوعات حقيقية.
لا تشغّلها أبدًا على قاعدة بيانات الإنتاج: هي تنشئ حجوزات وتعدّل الأسعار والإعدادات مؤقتًا.

```bash
# 1) قاعدة بيانات تجريبية + بيانات أولية
npm run db:migrate && SEED_CATALOG=full npm run db:seed   # the tests use every Saudi city

# 2) في ملف .env للاختبار:
#    MYFATOORAH_API_KEY=test-mf-token-123
#    MYFATOORAH_API_BASE=http://localhost:4010
#    MYFATOORAH_WEBHOOK_SECRET=test-mf-webhook-secret
#    NEXT_PUBLIC_SITE_URL=http://localhost:3001
#    ADMIN_EMAIL=admin@example.com  ADMIN_PASSWORD=Admin12345

# 3) ثلاث نوافذ:
npm run test:mock                         # محاكاة ماي فاتورة على المنفذ 4010
npm run build && npx next start -p 3001   # الموقع
npx playwright install chromium && BASE=http://localhost:3001 npm run test:e2e
```

لتشغيل قسم واحد: `ONLY=pay npm run test:e2e` (الأقسام: flow, pay, security, admin, ux, features).
