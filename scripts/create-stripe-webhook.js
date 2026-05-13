#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const URL = process.env.AWM_STRIPE_WEBHOOK_URL || 'https://ai-work-market.vercel.app/api/stripe-webhook';
const OUT = '/home/dario/.config/yoshi-payments/stripe-webhook.env';
const STRIPE_API = 'https://api.stripe.com/v1';
function form(obj){const p=new URLSearchParams();function add(k,v){if(Array.isArray(v)){v.forEach((vv,i)=>add(`${k}[${i}]`,vv))}else if(v&&typeof v==='object'){for(const[kk,vv]of Object.entries(v))add(`${k}[${kk}]`,vv)}else if(v!==undefined&&v!==null)p.append(k,String(v))}for(const[k,v]of Object.entries(obj))add(k,v);return p}
async function stripe(method, endpoint, body){const res=await fetch(`${STRIPE_API}${endpoint}`,{method,headers:{Authorization:`Bearer ${SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:body?form(body):undefined});const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json?.error?.message||`${res.status} ${res.statusText}`);return json}
(async()=>{if(!SECRET_KEY){console.error('STRIPE_SECRET_KEY missing');process.exit(2)}const endpoint=await stripe('POST','/webhook_endpoints',{url:URL,enabled_events:['checkout.session.completed','payment_intent.succeeded','payment_intent.payment_failed'],metadata:{app:'ai-work-market',created_by:'yoshi',purpose:'fulfillment_v1'}});fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,`STRIPE_WEBHOOK_ENDPOINT_ID="${endpoint.id}"\nSTRIPE_WEBHOOK_SECRET="${endpoint.secret}"\nAWM_STRIPE_WEBHOOK_URL="${URL}"\n`);fs.chmodSync(OUT,0o600);console.log(`created endpoint ${endpoint.id}`);console.log(`secret saved to ${OUT}`)})().catch(e=>{console.error(e.message||e);process.exit(1)});
