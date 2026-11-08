#!/usr/bin/env python3
"""Opt-in integration smoke of a running local-workspace.py fixture, never a remote API.

Creates a synthetic local browser session. Negative SQL cases run in transactions
that abort/roll back; no payment/provider actions, real identities, or secrets printed.
"""
import base64,hashlib,hmac,importlib.util,json,subprocess,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('localworkspace',root/'scripts/local-workspace.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
private=root/'.local-workspace'; settings=m.load_settings(private); count=0

def request(path,body=None,origin=m.WEB_URL,token=None,headers=None):
 h={'Content-Type':'application/json'}
 if origin is not None:h['Origin']=origin
 if token:h['Authorization']='Bearer '+token
 h.update(headers or {})
 req=Request(m.API_URL+path,data=None if body is None else json.dumps(body).encode(),headers=h)
 try:
  with urlopen(req,timeout=10) as r:return r.status,json.loads(r.read() or b'null')
 except HTTPError as e:
  data=e.read()
  try:decoded=json.loads(data)
  except (ValueError,UnicodeError):decoded=None
  return e.code,decoded

def check(condition,label):
 global count
 if not condition:raise AssertionError(label)
 count+=1;print('PASS '+label)

status,cap=request('/api/admin-auth/development-access');check(status==200 and cap=={'enabled':True,'mode':'LOCAL_DEVELOPMENT'},'guarded development capability')
status,_=request('/api/admin-auth/development-access',origin='http://untrusted.example');check(status==403,'wrong origin denied')
status,cap=request('/api/admin-auth/development-access',origin=None);check(status==200 and cap=={'enabled':False,'mode':None},'missing origin unavailable')
status,_=request('/api/admin-auth/development-session',{'deviceId':str(uuid.uuid4())},origin='http://untrusted.example');check(status==403,'untrusted session issuance denied')
status,session=request('/api/admin-auth/development-session',{'deviceId':str(uuid.uuid4()),'deviceLabel':'Local workspace smoke'});check(status==200 and session.get('accessToken') and session.get('refreshToken'),'ordinary fixture session issued')
token=session['accessToken'];status,me=request('/api/auth/me',token=token);check(status==200 and me['id']==settings['fixtureUserId'] and set(me['roles'])=={'ADMIN','SUPER_ADMIN'},'authenticated exact synthetic roles')
status,overview=request('/api/admin/web/overview',token=token);check(status==200 and isinstance(overview,dict),'authenticated real admin overview')
status,providers=request('/api/payments/providers');check(status==200 and len(providers)>0 and all(not p['checkoutConnected'] and not p['customerCheckoutEnabled'] for p in providers),'provider checkout remains disconnected')
status,_=request('/api/admin/web/overview');check(status in (401,403),'anonymous admin read denied')
head,payload,_=token.split('.');pad=lambda s:s+'='*((4-len(s)%4)%4)
check(hmac.compare_digest(hmac.new(settings['jwtSecret'].encode(),(head+'.'+payload).encode(),{'HS256':hashlib.sha256,'HS384':hashlib.sha384,'HS512':hashlib.sha512}[json.loads(base64.urlsafe_b64decode(pad(head)))['alg']]).digest(),base64.urlsafe_b64decode(pad(token.split('.')[2]))),'issued token uses generated local signing key')
claims=json.loads(base64.urlsafe_b64decode(pad(payload)));claims['iss']='sequo-api';claims['aud']='sequo-mobile'
enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=').decode();changed=enc(json.dumps(claims,separators=(',',':')).encode());message=head+'.'+changed
alg=json.loads(base64.urlsafe_b64decode(pad(head)))['alg'];signature=hmac.new(settings['jwtSecret'].encode(),message.encode(),{'HS256':hashlib.sha256,'HS384':hashlib.sha384,'HS512':hashlib.sha512}[alg]).digest()
status,_=request('/api/admin/web/overview',token=message+'.'+enc(signature));check(status in (401,403),'ordinary issuer/audience token denied despite same synthetic key')
compose=['docker','compose','--project-name',m.project_name(settings),'--file',str(root/'compose.local-workspace.yaml'),'--env-file',str(private/'compose.env'),'exec','-T','postgres','psql','--no-psqlrc','--set','ON_ERROR_STOP=1','--username',m.DATABASE,'--dbname',m.DATABASE,'--tuples-only','--no-align']
def sql(value):return subprocess.run(compose,input=value,text=True,capture_output=True,env=m.clean_environment(),cwd=private)
snapshot="SELECT json_build_object('id',u.id,'email',u.email,'name',u.display_name,'created',u.created_at,'active',u.is_active,'status',u.status,'roles',(SELECT json_agg(role_code ORDER BY role_code) FROM user_roles WHERE user_id=u.id))::text FROM users u WHERE id='%s';"%settings['fixtureUserId']
before=sql(snapshot);check(before.returncode==0 and before.stdout.strip(),'fixture persisted after Flyway')
repeat=sql(m.seed_sql(settings));after=sql(snapshot);check(repeat.returncode==0 and before.stdout==after.stdout,'seed replay retains exact identity roles and creation time')
guard=m.seed_sql(settings).removeprefix('BEGIN;\n').removesuffix('COMMIT;\n')
changedroles=sql("BEGIN; DELETE FROM user_roles WHERE user_id='%s';\n"%settings['fixtureUserId']+guard+'\nROLLBACK;')
check(changedroles.returncode!=0 and 'refusing account promotion or repair' in changedroles.stderr and sql(snapshot).stdout==before.stdout,'changed roles refused without promotion and transaction rolled back')
changedidentity=sql("BEGIN; UPDATE users SET display_name='Changed fixture identity' WHERE id='%s';\n"%settings['fixtureUserId']+guard+'\nROLLBACK;')
check(changedidentity.returncode!=0 and 'refusing account promotion or repair' in changedidentity.stderr and sql(snapshot).stdout==before.stdout,'changed identity refused without repair and transaction rolled back')
with urlopen(m.WEB_URL,timeout=10) as r:check(r.status==200,'real Vite app served on loopback')
privateconfig=(private/'api.properties').read_text();check('spring.config.import=\n' in privateconfig and 'spring.profiles.active=local\n' in privateconfig,'sole generated API config avoids optional secret import')
for name in ['settings.json','api.properties','compose.env','api.jar','api.log','web.log']:
 check((private/name).stat().st_mode & 0o077==0,'private mode '+name)
print('TOTAL',count,'PASS')
