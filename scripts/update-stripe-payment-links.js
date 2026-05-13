#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API = 'https://api.stripe.com/v1';
const ORIGIN = process.env.AWM_PUBLIC_ORIGIN || 'https://ai-work-market.vercel.app';
function form(obj){const p=new URLSearchParams();function add(k,v){if(v&&typeof v==='object'&&!Array.isArray(v)){for(const [kk,vv] of Object.entries(v))add(`${k}[${kk}]`,vv)}else if(v!==undefined&&v!==null)p.append(k,String(v))}for(const[k,v]of Object.entries(obj))add(k,v);return p}
async function stripe(method, endpoint, body){const res=await fetch(`${STRIPE_API}${endpoint}`,{method,headers:{Authorization:`Bearer ${SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:body?form(body):undefined});const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json?.error?.message||`${res.status} ${res.statusText}`);return json}
(async()=>{if(!SECRET_KEY){console.error('STRIPE_SECRET_KEY missing');process.exit(2)}const file=path.join(process.cwd(),'products/payment-links.json');const data=JSON.parse(fs.readFileSync(file,'utf8'));for(const item of data.products||[]){if(!item.paymentLinkId)continue;const url=`${ORIGIN}/purchase-complete?paid=${encodeURIComponent(item.slug)}`;const updated=await stripe('POST',`/payment_links/${item.paymentLinkId}`,{after_completion:{type:'redirect',redirect:{url}},metadata:{app:'ai-work-market',slug:item.slug,fulfillment:'manual_v1'}});item.afterCompletionUrl=url;item.paymentLinkUrl=updated.url||item.paymentLinkUrl;console.log(`${item.slug}: ${url}`)}data.updatedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n')})().catch(e=>{console.error(e.message||e);process.exit(1)});
