# درایو سازمانی — Cloude Drive

زیرساخت مدیریت و اشتراک‌گذاری اسناد سازمانی با رابط فارسی و راست‌به‌چپ و معماری ماژولار؛ با هدف توسعهٔ تدریجی و اجرای مستقل از اینترنت.

> پروژه هنوز جایگزین کامل Google Drive یا MVP آمادهٔ تحویل نیست. Compose فعلی، محیط **توسعهٔ یکپارچه** شامل وب، ورکر، PostgreSQL، Redis و MinIO را همراه با آماده‌سازی خودکار اجرا می‌کند؛ استقرار production نیست.

## وضعیت امکانات

| بخش | وضعیت فعلی |
| --- | --- |
| ورود | نام کاربری یا ایمیل و رمز عبور؛ ساخت مدیر اولیه با seed |
| نشست | JWT، رکورد قابل لغو در Redis، کوکی HttpOnly و بررسی فعال بودن کاربر |
| نقش و مدیریت | پنل مدیر برای کاربران، نقش‌ها، فعال‌بودن حساب، تنظیمات آپلود و گزارش رویدادها |
| فایل | کارپوشهٔ کاربر با جست‌وجوی نام، آپلود، دانلود، حذف نرم و بازیابی از سطل زباله |
| پردازش | صف BullMQ و ورکر مستقل برای بررسی نسخهٔ آپلودشده |
| اشتراک‌گذاری | اشتراک فایل با کاربر و لینک عمومی زمان‌دار؛ نمایش موارد دریافتی و ارسالی و لغو دسترسی |
| امنیت فایل | رمزنگاری محرمانهٔ سمت مرورگر با هویت دستگاه و کد بازیابی؛ فایل‌های عادی رمزنگاری سمت کاربر ندارند |
| رابط کاربری | صفحهٔ معرفی، ورود، کارپوشه، اشتراک‌گذاری، داشبورد مدیریت و صفحهٔ عمومی لینک |
| نمایش و ویرایش | دانلود پیاده‌سازی شده؛ پیش‌نمایش و ویرایش PDF/Word/Excel هنوز وجود ندارد؛ اشتراک VIEW نیز فعلاً پیش‌نمایش ندارد |

پوشه‌بندی، تغییرنام فایل، ثبت‌نام عمومی، بازیابی رمز، MFA، آپلود چندقسمتی و اسکن بدافزار وجود ندارند. حذف فایل نرم است؛ ورکر فایل‌های سطل زباله را پس از پایان مهلت نگهداری (پیش‌فرض ۳۰ روز) پاک می‌کند. پس از ورود موفق، کاربر به کارپوشه می‌رود.

فناوری‌ها: **Next.js 16 / React 19 / TypeScript / Tailwind CSS 4**، **PostgreSQL 17 / Prisma 6**، **Redis 7.4 / BullMQ** و ذخیره‌سازی سازگار با S3. بایت‌های فایل در storage و متادیتا در PostgreSQL نگهداری می‌شوند. ظرفیت چند ده هزار کاربر هنوز با آزمون بار تأیید نشده است.

## راه‌اندازی سریع توسعه

پیش‌نیاز: Docker Engine یا Docker Desktop فعال با Linux containers و Docker Compose v2 به‌روز. **برای اجرای Compose به Node.js یا npm روی میزبان نیاز نیست**؛ نصب وابستگی‌ها و تولید Prisma Client داخل build انجام می‌شود. نصب و build اولیه می‌توانند آنلاین باشند.

از ریشهٔ پروژه، فقط اگر `.env` وجود ندارد، نمونه را کپی کنید؛ مثال برای PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env` را تکمیل کنید و فایل موجود را بازنویسی نکنید. رازها را تصادفی و مستقل انتخاب کنید؛ فایل محیط، خروجی کامل تنظیمات Compose و URLهای امضاشده را منتشر نکنید.

| متغیر | مقدار یا قاعده |
| --- | --- |
| `DATABASE_URL` | برای اجرای ابزارهای میزبان؛ اتصال PostgreSQL با میزبان، پورت، نام DB و رمز معتبر |
| `REDIS_URL` | برای اجرای ورکر/ابزارهای میزبان؛ اتصال Redis با رمز معتبر |
| `POSTGRES_USER` / `POSTGRES_DB` | پیش‌فرض هر دو `clouddrive` |
| `POSTGRES_PASSWORD` / `REDIS_PASSWORD` | رمز خام و مستقل هر سرویس؛ نباید خالی باشند |
| `MINIO_ROOT_USER` | پیش‌فرض `clouddrive`؛ فقط مدیریت storage |
| `MINIO_ROOT_PASSWORD` | رمز مستقل با حداقل ۸ کاراکتر |
| `S3_ACCESS_KEY_ID` | شناسهٔ برنامه: ۳ تا ۲۰ کاراکتر ASCII از حروف، اعداد، `_` و `-`؛ شروع با `-` مجاز نیست |
| `S3_SECRET_ACCESS_KEY` | ۸ تا ۴۰ کاراکتر ASCII قابل چاپ، بدون فاصله و whitespace |
| `APP_ORIGIN` | پیش‌فرض محلی `http://localhost:3000`، بدون مسیر یا اسلش انتهایی |
| `SESSION_SECRET` | راز تصادفی با حداقل ۳۲ بایت UTF-8 |
| `ADMIN_EMAIL` / `ADMIN_NAME` | ایمیل معتبر و نام نمایشی غیرخالی برای seed |
| `ADMIN_USERNAME` | برای ورود با نام کاربری و smoke تکمیل شود؛ در seed اختیاری است |
| `ADMIN_PASSWORD` | حداقل ۱۲ کاراکتر و حداکثر ۱۰۲۴ بایت UTF-8 |
| `S3_PUBLIC_ENDPOINT` | endpoint قابل دسترسی میزبان/مرورگر؛ پیش‌فرض `http://localhost:9000` |
| `S3_REGION` / `S3_BUCKET` | پیش‌فرض `us-east-1` / `clouddrive`؛ نام bucket سادهٔ DNS با حروف کوچک، بدون نقطه |
| `MAX_UPLOAD_BYTES` | پیش‌فرض `104857600`، برابر ۱۰۰ MiB؛ عدد مثبت معتبر |
| `FILE_WORKER_CONCURRENCY` | پیش‌فرض ۲، سقف ۸؛ به ورکر Compose منتقل می‌شود |

شناسه و راز برنامهٔ S3 باید **هر دو با مقادیر متناظر root متفاوت باشند**. از حساب root برای وب، ورکر یا smoke استفاده نکنید. برای رمزهای دارای `$` یا `#`، قواعد نقل‌قول `.env` را رعایت کنید؛ مقدار تک‌نقل‌قول‌شده در Compose به‌صورت literal خوانده می‌شود.

در Compose، entrypoint از رمزهای **خام** PostgreSQL و Redis، URL داخلی را با `encodeURIComponent` می‌سازد؛ این رمزها را از قبل URL-encode نکنید. Compose URLهای اتصال داخلی را خودش می‌سازد و از `DATABASE_URL` و `REDIS_URL` فایل `.env` برای اتصال سرویس‌ها استفاده نمی‌کند. PostgreSQL و Redis روی `127.0.0.1` پورت‌های پیش‌فرض 5432 و 6379 را منتشر می‌کنند؛ URLهای میزبان در `.env` برای ابزارهای دستی‌اند و باید با رمز واقعی و URL-encoding صحیح تنظیم شوند.

پس از تکمیل `.env`، برای اجرای یکپارچهٔ محیط توسعه با Docker Compose:

```powershell
docker compose up --build -d
```

این فرمان ایمیج dev را می‌سازد و ایمیج‌های زیرساختِ موجودنبودن را دریافت می‌کند. آماده‌سازی خودکار شامل migration، seed، ایجاد/اعتبارسنجی کلید پایدار، bucket خصوصی با versioning و SSE-KMS، کاربر و IAM جداگانهٔ برنامه و CORS است؛ سپس وب و ورکر اجرا می‌شوند.

### اجرای وب و ورکر از روی سورس

برای توسعهٔ مستقیم روی میزبان، Node.js 22.13 یا بالاتر از شاخهٔ 22 و npm لازم است. ابتدا وابستگی‌ها را نصب و فایل محیط را بسازید:

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

`.env` را با رازهای معتبر تکمیل کنید. برای این روش، `DATABASE_URL` و `REDIS_URL` باید به سرویس‌های قابل‌دسترسی از میزبان اشاره کنند؛ نمونه‌های دارای `replace-me` را عوض کنید. Compose پورت PostgreSQL و Redis را روی localhost منتشر می‌کند. برای بالا آوردن زیرساخت Compose (PostgreSQL، Redis و MinIO با KMS و آماده‌سازی storage) اجرا کنید:

```powershell
docker compose up -d postgres redis minio kms-key-init storage-init
```

سپس migration و مدیر اولیه را بسازید و در ترمینال‌های جداگانه وب و ورکر را اجرا کنید:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

```powershell
npm run worker
```

`npm run dev` و `npm run build` پیش از اجرای Next.js به‌طور خودکار Prisma Client را تولید می‌کنند. برای کار با فایل‌ها، علاوه بر PostgreSQL و Redis، پیکربندی MinIO/S3 و متغیرهای S3 در `.env` نیز باید معتبر باشند.

```powershell
docker compose ps -a
docker compose logs --tail 100 kms-key-init storage-init migrate seed dev-web dev-worker
```

سرویس‌های `kms-key-init`، `storage-init`، `migrate` و `seed` یک‌باره‌اند؛ پایان با کد صفر طبیعی است. زیرساخت باید healthy و وب/ورکر در حال اجرا باشند. `/api/health` فقط liveness وب است و سلامت DB، storage یا ورکر را تضمین نمی‌کند.

- ورود: `http://localhost:3000/login` با نام کاربری یا ایمیل مدیر و رمز حساب.
- کنسول MinIO: `http://localhost:9001` با حساب root؛ endpoint داده روی پورت `9000` است.
- پورت‌های وب، S3 و کنسول فقط روی `127.0.0.1` منتشرند؛ با `DEV_WEB_PORT`، `DEV_S3_PORT` و `DEV_CONSOLE_PORT` تغییر می‌کنند.
- هنگام تغییر پورت وب یا S3، `APP_ORIGIN` و `S3_PUBLIC_ENDPOINT` را نیز هماهنگ کنید. `localhost` و `127.0.0.1` origin یکسان نیستند.
- کد وب و ورکر **داخل ایمیج کپی می‌شود و bind mount نیست**؛ پس از تغییر کد دوباره `docker compose up --build -d` اجرا کنید. فقط اسکریپت `storage-init.sh` به‌صورت read-only mount شده است.

### حساب اولیه و دادهٔ موجود

نام کاربری ۳ تا ۳۲ کاراکتر ASCII است؛ با حرف یا عدد شروع می‌شود و سپس حروف، اعداد، `.`, `_`, `-` مجازند. نام کاربری و ایمیل trim و lowercase می‌شوند؛ رمز تغییر داده نمی‌شود. کاربران بدون نام کاربری می‌توانند با ایمیل وارد شوند.

seed رمز حساب موجود را **بازنشانی نمی‌کند**؛ تغییر `ADMIN_PASSWORD` در `.env` رمز قبلی را عوض نمی‌کند. افزودن نام کاربری فقط برای مدیر موجودِ فاقد نام کاربری مجاز است؛ نام متفاوت یا تکراری خطا می‌دهد. رمز پیش‌فرض یا حساب مخفی وجود ندارد.

مقادیر الزامی `ADMIN_EMAIL`، `ADMIN_PASSWORD` و `ADMIN_NAME` را در `.env` امن نگه دارید: در **هر parse تنظیمات Compose** لازم‌اند، حتی پس از seed. این مقادیر فقط به سرویس seed داده می‌شوند، نه محیط وب و ورکر.

## قرارداد ذخیره‌سازی و کلید توسعه

Compose صریحاً `S3_PROVIDER=minio` و endpoint داخلی `S3_ENDPOINT=http://minio:9000` را تعیین می‌کند؛ تغییر `S3_ENDPOINT` در `.env` این مقدار را عوض نمی‌کند. `S3_PUBLIC_ENDPOINT` فقط مقصد URL امضاشدهٔ آپلود است؛ نام `minio` برای مرورگر میزبان قابل اتکا نیست و «public endpoint» به معنی عمومی بودن bucket نیست.

- `storage-init` bucket را می‌سازد، versioning و SSE-KMS را فعال و بررسی می‌کند و IAM برنامه را به همان bucket محدود می‌کند؛ مجوز تغییر policy، مدیریت کاربران یا حذف فایل به برنامه نمی‌دهد.
- policy موجودِ غیرمنتظره، گروه/مجوز غیرمنتظرهٔ کاربر و عدم تطابق اعتبارنامهٔ موجود باعث توقف آماده‌سازی می‌شوند؛ اسکریپت policy ناشناخته را حذف یا راز کاربر موجود را reset نمی‌کند.
- CORS سراسری MinIO از `APP_ORIGIN` تنظیم می‌شود تا preflight و PUT مستقیم با هدرهای لازم ممکن باشد؛ CORS جای احراز هویت و خصوصی بودن bucket را نمی‌گیرد.
- شناسهٔ کلید در Compose ثابت است: `arn:aws:kms:clouddrive-dev`. مقدار `.env` برای ابزارهای دستی و smoke باید با آن هماهنگ باشد.

**KMS این محیط، قابلیت embedded توسعهٔ MinIO با یک master key است، نه KMS مناسب production.** سرویس root به نام `kms-key-init` کلید تصادفی ۳۲بایتی را در `kms_data`، مسیر `/kms/master.key`، با مالک root و مجوز `0600` ایجاد می‌کند. کلید موجود اعتبارسنجی و دوباره استفاده می‌شود، نه جایگزین؛ MinIO آن را read-only می‌خواند.

**volume به نام `kms_data` را هرگز برای restart یا بازسازی برنامه حذف نکنید.** باقی ماندن فایل‌ها در `minio_data` بدون همان کلید برای بازیابی کافی نیست. کلید را همراه داده و نسخه‌های فایل با روش امن پشتیبان‌گیری کنید.

انتخاب provider در کد صریح است و fallback خودکار وجود ندارد:

| provider | اعتبارسنجی پیش از امضای آپلود |
| --- | --- |
| `aws`، پیش‌فرض در نبود `S3_PROVIDER` | versioning فعال و هر چهار پرچم `BlockPublicAcls`، `IgnorePublicAcls`، `BlockPublicPolicy` و `RestrictPublicBuckets` |
| `minio` | versioning فعال، نبود هرگونه bucket policy و ACL خصوصیِ مورد انتظار با تنها یک grant از نوع CanonicalUser / FULL_CONTROL |

در حالت MinIO فقط خطای دقیق `NoSuchBucketPolicy` با HTTP 404 به معنی نبود policy پذیرفته می‌شود؛ پاسخ policy موجود، ACL نامعتبر یا خطای دسترسی/شبکه **fail-closed** است. این بررسی‌ها مانع تغییر policy توسط مدیر storage پس از بررسی نمی‌شوند و جای کنترل مدیریتی و پایش را نمی‌گیرند.

جریان فایل:

```text
درخواست URL → PENDING → PUT مستقیم با SHA-256 و SSE-KMS
→ complete و HEAD → ثبت نسخهٔ ثابت و PROCESSING
→ صف Redis → بررسی مجدد ورکر → READY یا REJECTED
```

`READY` فقط تأیید اندازه، checksum، نسخه و اطلاعات رمزنگاری است؛ **اسکن بدافزار یا تضمین امن بودن سند نیست**. ورکر تبدیل و پیش‌نمایش تولید نمی‌کند. ثبت DB و enqueue اتمیک نیست؛ تکرار complete شکست موقت صف را جبران می‌کند، اما reconciler و پاک‌سازی آپلودهای رهاشده هنوز وجود ندارند.

## اجرای بدون دریافت اینترنتی و production

پس از build آنلاین و آماده بودن **همهٔ ایمیج‌ها** روی میزبان مقصد، برای جلوگیری از build و pull هنگام startup:

```powershell
docker compose up -d --no-build --pull never
```

پیش از اتکا به این دستور، وجود `--pull` را در `docker compose up --help` بررسی کنید. CLI بررسی‌شدهٔ این محیط، Compose `v2.7.0`، این گزینه را نه در `up` و نه در گزینه‌های والد دارد؛ برای دستور بالا Compose را در مرحلهٔ آماده‌سازی به‌روز کنید. حذف گزینهٔ نامعتبر معادل تضمین «بدون pull» نیست؛ زیرساخت در فایل فعلی `pull_policy: missing` دارد.

پشتهٔ فعلی در زمان اجرا وابستگی به سرویس خارجی ندارد؛ PostgreSQL، Redis، MinIO و کلید توسعه محلی‌اند. فونت سیستمی است و منابع رابط از خود برنامه سرو می‌شوند. telemetry و metadata discovery با `NEXT_TELEMETRY_DISABLED=1`، `CHECKPOINT_DISABLE=1` و `AWS_EC2_METADATA_DISABLED=true` غیرفعال‌اند.

با این حال شبکهٔ پیش‌فرض Compose **bridge معمولی است و egress را مسدود نمی‌کند**. دستور بدون pull نیز جداسازی شبکه ایجاد نمی‌کند. اجرای واقعی با خروجی اینترنت مسدود و منابع مرورگر هنوز آزموده نشده است؛ نبود وابستگی خارجی با اثبات انزوای شبکه متفاوت است.

ایمیج production همچنان قابل ساخت است:

```powershell
docker build --target runtime -t cloude-drive:local .
```

این target برنامه و Prisma Client را build می‌کند و با `npm start` اجرا می‌شود؛ startup آن migration یا seed خودکار ندارد. **Compose فعلی فقط dev است**؛ production به orchestration جداگانه برای وب/ورکر، migration/seed، secrets و سرویس‌های داخلی نیاز دارد.

در production، HTTPS معتبر برای وب و هر دو endpoint ذخیره‌سازی الزامی است؛ کوکی نشست Secure است. reverse proxy، گواهی، KMS مستقل با مدیریت/چرخش/بازیابی صحیح کلید، backup، مانیتورینگ و کنترل خروج شبکه باید جداگانه فراهم شوند. master key توسعه را جایگزین مدیریت کلید عملیاتی نکنید. برای هدف بدون اینترنت، تمام سرویس‌های لازم از جمله KMS و ویرایشگر آینده باید داخل شبکهٔ سازمان باشند.

## APIهای فعلی

| متد | مسیر | کاربرد |
| --- | --- | --- |
| GET | `/api/health` | liveness عمومی؛ فقط `{ "status": "ok" }` |
| POST | `/api/auth/login` | ورود و تنظیم کوکی نشست |
| POST | `/api/auth/logout` | لغو نشست فعلی |
| GET | `/api/auth/me` | هویت و نقش‌های کاربر |
| GET | `/api/files?cursor=<uuid>` | فهرست فایل‌ها و سطل زبالهٔ کاربر |
| POST | `/api/files/uploads` | ساخت رکورد و URL آپلود |
| DELETE | `/api/files/:id` | حذف نرم فایل |
| POST | `/api/files/:id/complete` | تأیید آپلود و ارسال به صف |
| GET | `/api/files/:id/download` | دانلود فایل مجاز |
| POST | `/api/files/:id/restore` | بازیابی فایل حذف‌شده |
| GET / POST | `/api/shares` | فهرست اشتراک‌ها و اشتراک فایل با کاربر |
| GET | `/api/shares/recipient` | جست‌وجوی گیرندهٔ اشتراک |
| DELETE | `/api/shares/:id` | لغو اشتراک با کاربر |
| GET | `/api/shares/:id/download` | دانلود فایل اشتراکی |
| GET / POST | `/api/links` | فهرست و ساخت لینک عمومی |
| DELETE | `/api/links/:id` | لغو لینک عمومی |
| GET | `/api/public-links/:token` | اطلاعات عمومی لینک |
| GET | `/api/public-links/:token/download` | دانلود از لینک عمومی |
| GET / PUT | `/api/security/recovery-key` | وضعیت/ثبت کد بازیابی هویت دستگاه |
| GET / PUT / DELETE | `/api/security/identity-key` | دریافت، ثبت یا حذف کلید هویت دستگاه |
| GET / POST | `/api/admin/users` | فهرست و ایجاد کاربر؛ نیازمند دسترسی مدیر |
| PATCH | `/api/admin/users/:id` | ویرایش کاربر، نقش و وضعیت |
| GET / PATCH | `/api/admin/settings` | دریافت/تغییر تنظیمات |
| GET | `/api/admin/dashboard` | آمار داشبورد مدیریت |
| GET | `/api/admin/audit-logs` | گزارش رویدادهای ممیزی |

تمام POSTها `Origin` مطابق `APP_ORIGIN` می‌خواهند؛ JSON باید `Content-Type: application/json` داشته باشد و حداکثر ۱۶ KiB باشد. مسیرهای محافظت‌شده به کوکی نشست نیاز دارند.

ورود `identifier` و `password` می‌گیرد؛ به‌جای `identifier` فقط یکی از `username` یا `email` مجاز است، نه چند شناسه یا فیلد اضافه. محدودیت ورود ۱۰ تلاش در ۱۵ دقیقه برای شناسه و حساب است؛ موفق‌ها نیز شمرده می‌شوند. نشست ۸ ساعت اعتبار دارد.

آپلود `name`، `mimeType`، `size` و `checksum` می‌گیرد؛ checksum خروجی SHA-256 با Base64 استاندارد است، نه hex. فایل صفر بایتی مجاز نیست و شروع آپلود به ۲۰ درخواست در دقیقه برای هر کاربر محدود است. PUT باید هدرهای پاسخ API را رعایت کند؛ مرورگر `Content-Length` را خودش مدیریت می‌کند.

## آزمون و توسعه روی میزبان

برای ابزارهای میزبان، **Node.js 22.13 یا بالاتر از شاخهٔ 22** و وابستگی‌های نصب‌شده با `npm ci` لازم است؛ این پیش‌نیاز راه‌اندازی Compose نیست. ابزارهای دستی از `.env` ریشه استفاده می‌کنند؛ به بارگذاری `.env.local` توسط همهٔ ابزارها تکیه نکنید.

```powershell
npm ci
npm test
npm run lint
npm run typecheck
```

تست‌های واحد سرویس‌ها از mock استفاده می‌کنند و به Docker نیاز ندارند؛ عبور آن‌ها اتصال واقعی یا ظرفیت سیستم را ثابت نمی‌کند. برای بررسی یکپارچهٔ محیط، از smoke روی پشتهٔ روشن استفاده کنید.

برای تکرار smoke روی پشتهٔ روشن، با `.env` معتبر و `ADMIN_USERNAME` و رمز واقعی حساب موجود:

```powershell
node docker/smoke.mjs
```

اسکریپت به endpointهای localhost/127.0.0.1 متصل می‌شود و با اعتبارنامهٔ **برنامه، نه root** نسخهٔ object را مستقیماً از S3 می‌خواند؛ این API یا UI دانلود محصول نیست. هر اجرا یک فایل کوچک و رکورد واقعی ایجاد می‌کند و **آن‌ها را نگه می‌دارد**؛ پاک‌سازی خودکار ندارد.

برای آزمون پایداری کلید، `node docker/smoke.mjs --pause-before-readback` را اجرا کنید. در توقف اسکریپت، از ترمینال دیگر `docker compose restart minio` بزنید، منتظر healthy شدن بمانید و ظرف ۱۲۰ ثانیه در ترمینال اسکریپت `restarted` وارد کنید؛ خواندن همان نسخه تکرار می‌شود.

دستورات دستی موجود: `npm run db:generate`، `npm run db:migrate` و `npm run db:seed` برای Prisma؛ `npm run dev` و `npm run worker` برای توسعه؛ `npm run build` و `npm start` برای build و اجرای production. اجرای دستی به سرویس‌ها و متغیرهای محیطی قابل‌دسترسی از میزبان نیاز دارد.

ساختار اصلی: `src/app/` صفحات و API، `src/lib/` اتصال سرویس‌ها، `src/modules/` منطق دامنه، `src/workers/` ورکر، `prisma/` مدل و migration و seed، `docker/` ابزار آماده‌سازی و smoke. پیش از تغییر کد Next.js، `AGENTS.md` و راهنمای نسخهٔ نصب‌شده در `node_modules/next/dist/docs/` را بخوانید.

## نگهداری و رفع اشکال

| نشانه | بررسی پیشنهادی |
| --- | --- |
| خطای Docker یا گزینهٔ ناشناخته | فعال بودن Docker و نسخهٔ Compose؛ `docker compose up --help` |
| image موجود نیست | build/pull در مرحلهٔ آنلاین؛ همهٔ ایمیج‌ها را به میزبان آفلاین منتقل کنید |
| `Environment variable not found: DATABASE_URL` | اجرای میزبان: مقدار معتبر `DATABASE_URL` در `.env` و دیتابیس قابل‌دسترسی؛ Compose URL داخلی را خودش می‌سازد |
| خطای متغیر یا seed | `.env` کامل، قواعد مدیر و نام کاربری موجود؛ رمز قبلی با seed عوض نمی‌شود |
| توقف storage-init | تفاوت root/app، قواعد کلیدها، policy یا IAM غیرمنتظره؛ لاگ همان سرویس |
| خطای DB یا migration | health و لاگ `postgres` و `migrate`؛ رمز ذخیره‌شده در volume |
| ورود 403 یا CORS نامعتبر | تطابق دقیق origin مرورگر، `APP_ORIGIN` و پورت‌ها |
| ورود 429 | پایان پنجرهٔ محدودسازی را منتظر بمانید |
| آپلود خطا می‌دهد یا READY نمی‌شود | لاگ `dev-web` و `dev-worker`، storage/KMS، endpoint میزبان و اعتبارنامهٔ برنامه |

- توقف موقت: `docker compose stop`؛ حذف کانتینرها بدون حذف volume: `docker compose down`. برای حفظ داده **از `down -v` و حذف `kms_data` خودداری کنید**، حتی هنگام بازسازی برنامه.
- پیش از migration یا ارتقا، از PostgreSQL، objectها و نسخه‌هایشان و کلید پشتیبان بگیرید و بازیابی را آزمایش کنید. تغییر `POSTGRES_PASSWORD` در `.env` رمز دیتابیسِ volume موجود را خودکار عوض نمی‌کند.
- رمز کاربران با scrypt هش می‌شود؛ رمزنگاری فیلدهای حساس DB و دیسک/backup هنوز provision نشده است. SSE-KMS فایل‌ها server-side است، نه end-to-end؛ سرویس مجاز می‌تواند محتوای رمزگشایی‌شده را بخواند.
- TLS، اسکن بدافزار، مدیریت کلید و پایش پیش از استفادهٔ عملیاتی باید تکمیل شوند. رازها را در Git یا لاگ نگذارید. بررسی وابستگی‌ها را در آماده‌سازی آنلاین با `npm audit` انجام دهید؛ ادعای رفع هشدار قبلی زنجیرهٔ Prisma نداریم و ارتقای `--force` بدون بررسی توصیه نمی‌شود.
