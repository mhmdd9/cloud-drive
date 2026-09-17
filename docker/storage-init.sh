set +x
set -eu
umask 077
export LC_ALL=C
export MC_NO_COLOR=1
unset MC_DEBUG MC_JSON MC_QUIET MC_HOST_provision MC_HOST_application

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

has_field() {
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *\""$1"\":\ \""$2"\"*|*\""$1"\":\""$2"\"*) return 0 ;;
    esac
  done < "$3"
  return 1
}

has_key() {
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *\""$1"\":*) return 0 ;;
    esac
  done < "$2"
  return 1
}

[ -n "${MINIO_ROOT_USER:-}" ] || fail 'MINIO_ROOT_USER is required.'
[ -n "${MINIO_ROOT_PASSWORD:-}" ] || fail 'MINIO_ROOT_PASSWORD is required.'
[ -n "${S3_ACCESS_KEY_ID:-}" ] || fail 'S3_ACCESS_KEY_ID is required.'
[ -n "${S3_SECRET_ACCESS_KEY:-}" ] || fail 'S3_SECRET_ACCESS_KEY is required.'
[ -n "${S3_BUCKET:-}" ] || fail 'S3_BUCKET is required.'
[ -n "${APP_ORIGIN:-}" ] || fail 'APP_ORIGIN is required; configure MinIO global CORS in compose.'
[ "${S3_KMS_KEY_ID:-}" = 'arn:aws:kms:clouddrive-dev' ] || fail 'S3_KMS_KEY_ID must be arn:aws:kms:clouddrive-dev.'
[ "$S3_ACCESS_KEY_ID" != "$MINIO_ROOT_USER" ] || fail 'Application and root access keys must differ.'
[ "$S3_SECRET_ACCESS_KEY" != "$MINIO_ROOT_PASSWORD" ] || fail 'Application and root secrets must differ.'

case "$S3_BUCKET" in
  *[!a-z0-9-]*|-*|*-|xn--*|sthree-*|amzn-s3-demo-*|*--ol-s3|*--x-s3|*--table-s3)
    fail 'S3_BUCKET must be a safe lowercase DNS bucket name without dots.' ;;
esac
[ "${#S3_BUCKET}" -ge 3 ] && [ "${#S3_BUCKET}" -le 63 ] || fail 'S3_BUCKET must contain 3 to 63 characters.'
case "$S3_ACCESS_KEY_ID" in
  *[!A-Za-z0-9_-]*|-*) fail 'S3_ACCESS_KEY_ID contains unsupported characters.' ;;
esac
[ "${#S3_ACCESS_KEY_ID}" -ge 3 ] && [ "${#S3_ACCESS_KEY_ID}" -le 20 ] || fail 'S3_ACCESS_KEY_ID must contain 3 to 20 characters.'
[ "${#S3_SECRET_ACCESS_KEY}" -ge 8 ] && [ "${#S3_SECRET_ACCESS_KEY}" -le 40 ] || fail 'S3_SECRET_ACCESS_KEY must contain 8 to 40 characters.'
case "$S3_SECRET_ACCESS_KEY" in
  *[![:graph:]]*) fail 'S3_SECRET_ACCESS_KEY must contain only printable non-whitespace ASCII characters.' ;;
esac

workspace=$(mktemp -d /tmp/clouddrive-storage-init.XXXXXXXX) || fail 'Cannot create private provisioning workspace.'
trap 'rm -rf "$workspace"' 0
trap 'exit 1' HUP INT TERM
export MC_CONFIG_DIR="$workspace/mc"
endpoint='http://minio:9000'
target="provision/$S3_BUCKET"
policy="clouddrive-dev-$S3_BUCKET-$S3_ACCESS_KEY_ID"

mc alias set provision "$endpoint" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --api S3v4 --path on > /dev/null 2>&1 || fail 'Cannot configure provisioning credentials.'
mc alias set application "$endpoint" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" --api S3v4 --path on > /dev/null 2>&1 || fail 'Cannot configure application credentials.'

mc mb --ignore-existing "$target" > /dev/null 2>&1 || fail 'Cannot create or access the storage bucket.'
anonymous=$(mc anonymous get-json "$target" 2>/dev/null) || fail 'Cannot inspect the bucket policy.'
[ "$anonymous" = '{}' ] || fail 'Unexpected bucket policy exists; refusing to remove or replace it.'

existing=false
if mc --json admin user info provision "$S3_ACCESS_KEY_ID" > "$workspace/user.json" 2>/dev/null; then
  existing=true
  has_field userStatus enabled "$workspace/user.json" || fail 'Application user is not enabled.'
  if has_key memberOf "$workspace/user.json"; then
    fail 'Application user has unexpected group membership.'
  fi
  if has_key policyName "$workspace/user.json"; then
    has_field policyName "$policy" "$workspace/user.json" || fail 'Application user has unexpected identity policies.'
  fi
  mc stat "application/$S3_BUCKET" > /dev/null 2>&1 || fail 'Existing application credentials cannot access the bucket; refusing to reset the secret.'
else
  has_field Code XMinioAdminNoSuchUser "$workspace/user.json" || fail 'Cannot safely determine whether the application user exists.'
fi

mc version enable "$target" > /dev/null 2>&1 || fail 'Cannot enable bucket versioning.'
versioning=$(mc version info "$target" 2>/dev/null) || fail 'Cannot inspect bucket versioning.'
[ "$versioning" = "$target versioning is enabled" ] || fail 'Bucket versioning verification failed.'
mc encrypt set sse-kms "$S3_KMS_KEY_ID" "$target" > /dev/null 2>&1 || fail 'Cannot enable bucket SSE-KMS.'
mc --json encrypt info "$target" > "$workspace/encryption.json" 2>/dev/null || fail 'Cannot inspect bucket encryption.'
has_field algorithm aws:kms "$workspace/encryption.json" || fail 'Bucket encryption is not SSE-KMS.'
has_field keyId "$S3_KMS_KEY_ID" "$workspace/encryption.json" || fail 'Bucket encryption key does not match.'

printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket","s3:GetBucketPolicy","s3:GetBucketVersioning"],"Resource":["arn:aws:s3:::%s"]},{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:GetObjectVersion"],"Resource":["arn:aws:s3:::%s/*"]}]}\n' "$S3_BUCKET" "$S3_BUCKET" > "$workspace/policy.json"
mc admin policy create provision "$policy" "$workspace/policy.json" > /dev/null 2>&1 || fail 'Cannot create the application identity policy.'
if [ "$existing" = false ]; then
  printf '%s\n%s\n' "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" | mc admin user add provision > /dev/null 2>&1 || fail 'Cannot create the application user.'
fi
if ! mc admin policy attach provision "$policy" --user "$S3_ACCESS_KEY_ID" > /dev/null 2>&1; then
  mc --json admin user info provision "$S3_ACCESS_KEY_ID" > "$workspace/attached.json" 2>/dev/null || fail 'Cannot verify the application policy attachment.'
  has_field policyName "$policy" "$workspace/attached.json" || fail 'Cannot attach the application identity policy.'
fi
mc stat "application/$S3_BUCKET" > /dev/null 2>&1 || fail 'Application credentials cannot access the provisioned bucket.'
anonymous=$(mc anonymous get-json "$target" 2>/dev/null) || fail 'Cannot verify the final bucket policy.'
[ "$anonymous" = '{}' ] || fail 'Bucket policy changed during provisioning.'
printf '%s\n' 'Storage provisioning completed.'
