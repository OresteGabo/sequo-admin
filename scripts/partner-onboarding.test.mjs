import test from 'node:test'
import assert from 'node:assert/strict'
import { blankPartnerDraft, partnerDetails, preparePartnerIntent, restorePartnerIntent, sendPartnerIntent } from '../src/partnerOnboarding.ts'
const actor='reviewer',key='saved-partner-action',applicationId='ac04e3ad-81aa-45c0-85ed-792737042e40'
const draft=()=>({...blankPartnerDraft(),displayName:'Partner',phoneNumber:'+22890123457',city:'Lomé',neighborhood:'Tokoin',vehicleType:'Moto'})
const details=()=>partnerDetails('RIDER',draft())
const preview=()=>({details:details(),existingAccount:{id:'user-existing',publicReference:'UEA-XXX-XXX',displayName:'Original name',email:null,phoneNumber:'+22890123457',roles:['CUSTOMER'],updatedAt:'2026-11-09T17:00:00.123456Z'}})
test('one-step registration needs contact and profile details, not an account reference',()=>{
 const data=details();assert.equal(data.phoneNumber,'+22890123457');assert.equal(data.email,null);assert.equal('userId' in data,false)
 assert.throws(()=>partnerDetails('RIDER',{...draft(),phoneNumber:''}))
 assert.throws(()=>partnerDetails('HUB',{...draft(),businessName:'Hub'}))
 assert.throws(()=>partnerDetails('RIDER',{...draft(),vehicleType:'Boat'}))
})
test('review binds the exact existing account and application revisions and freezes edited details',()=>{
 const p=preview(),app={id:applicationId,kind:'RIDER',state:'PENDING',details:details(),updatedAt:'2026-11-09T17:00:00.654321Z'}
 const intent=preparePartnerIntent(actor,'RIDER',p,'Verified applicant',key,'Freelancer',app)
 p.details.displayName='Changed after review'
 assert.equal(intent.body.details.displayName,'Partner')
 assert.equal(intent.body.expectedUserUpdatedAt,'2026-11-09T17:00:00.123456Z')
 assert.equal(intent.body.expectedApplicationUpdatedAt,'2026-11-09T17:00:00.654321Z')
 assert.equal(intent.applicationId,applicationId)
 assert.throws(()=>preparePartnerIntent(actor,'RIDER',preview(),'Approved',key,'Freelancer',{...app,state:'APPROVED'}))
})
test('recovered reviews are bound to the current reviewer and partner page',()=>{
 const intent=preparePartnerIntent(actor,'RIDER',preview(),'Verified',key,'Freelancer')
 assert.deepEqual(restorePartnerIntent(JSON.stringify(intent),actor,'RIDER'),intent)
 assert.throws(()=>restorePartnerIntent(JSON.stringify(intent),'another-reviewer','RIDER'))
 assert.throws(()=>restorePartnerIntent(JSON.stringify(intent),actor,'HUB'))
})
test('submissions preserve retry identity and reject an unconfirmed actor or missing profile',async()=>{
 const intent=preparePartnerIntent(actor,'RIDER',preview(),'Verified',key,'Freelancer')
 const expected={id:'operation',actorUserId:actor,kind:'RIDER',action:'REGISTER',applicationId:null,userId:'user-existing',entityId:'rider-existing',userReference:'UEA-XXX-XXX',entityReference:'CEA-XXX-XXX'}
 let sent
 assert.deepEqual(await sendPartnerIntent(async(path,retry,method,body)=>{sent={path,method,body};return expected},intent),expected)
 assert.equal(sent.path,'/api/admin/web/onboarding/RIDER');assert.equal(sent.method,'POST');assert.equal(sent.body.idempotencyKey,key)
 await assert.rejects(sendPartnerIntent(async()=>({...expected,actorUserId:'another'}),intent))
 await assert.rejects(sendPartnerIntent(async()=>({...expected,entityId:null}),intent))
})
