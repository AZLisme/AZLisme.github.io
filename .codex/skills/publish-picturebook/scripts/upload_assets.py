#!/usr/bin/env python3
"""Upload checked immutable assets to the single configured COS bucket."""
import argparse,hashlib,json,logging,mimetypes,os,sys,termios
from pathlib import Path

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--plan',required=True);a=ap.parse_args();plan=json.loads(Path(a.plan).read_text())
 if plan.get('bucket')!='pbook-1252924514' or plan.get('region')!='ap-guangzhou':raise ValueError('Unexpected publication target')
 for item in plan['assets']:
  key=item['key'];parts=key.split('/')
  if len(parts)<5 or parts[0]!='books' or parts[3] not in ['images','audio'] or any(x in ['','..','.'] for x in parts) or '\\' in key:raise ValueError('Unsafe resource key')
  data=Path(item['file']).read_bytes()
  if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Resource changed after validation')
 from qcloud_cos import CosConfig,CosS3Client
 from qcloud_cos.cos_exception import CosServiceError
 logging.disable(logging.CRITICAL)
 sid=os.environ.get('COS_SECRET_ID');key=os.environ.get('COS_SECRET_KEY')
 if not sid or not key:
  if sys.stdin.isatty():
   attrs=termios.tcgetattr(sys.stdin);hidden=attrs.copy();hidden[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden);print('Ready for credential JSON on stdin (input hidden).',flush=True)
   try:auth=json.loads(sys.stdin.readline())
   finally:termios.tcsetattr(sys.stdin,termios.TCSANOW,attrs)
  else:auth=json.load(sys.stdin)
  sid,key=auth['id'],auth['key'];del auth
 c=CosS3Client(CosConfig(Region=plan['region'],SecretId=sid,SecretKey=key,Scheme='https',Timeout=20));del sid,key
 for item in plan['assets']:
  data=Path(item['file']).read_bytes()
  try:
   old=c.get_object(Bucket=plan['bucket'],Key=item['key'])['Body'].get_raw_stream().read()
   if hashlib.sha256(old).hexdigest()!=item['sha256']:raise ValueError('Refuse overwrite of existing immutable resource')
   print('Already verified',item['key'],flush=True);continue
  except CosServiceError as e:
   if e.get_status_code()!=404:raise ValueError('Read check failed: '+e.get_error_code()) from None
  c.put_object(Bucket=plan['bucket'],Key=item['key'],Body=data,ACL='public-read',ContentType=mimetypes.guess_type(item['file'])[0] or 'application/octet-stream',CacheControl='public, max-age=31536000, immutable',Metadata={'x-cos-meta-sha256':item['sha256']},EnableMD5=True)
  got=c.get_object(Bucket=plan['bucket'],Key=item['key'])['Body'].get_raw_stream().read()
  if hashlib.sha256(got).hexdigest()!=item['sha256']:raise ValueError('Resource readback mismatch')
  print('Verified',item['key'],flush=True)
 print('Assets verified; GitHub publication is a separate final step',flush=True)
if __name__=='__main__':
 try:main()
 except Exception as e:print('Upload failed:',type(e).__name__,str(e) if isinstance(e,ValueError) else 'Check credentials and service availability',file=sys.stderr);raise SystemExit(1)
