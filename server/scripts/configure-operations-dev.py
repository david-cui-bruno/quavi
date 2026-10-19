#!/usr/bin/env python3
"""Idempotent Quavi-dev alert setup. Requires owner/operator gcloud credentials."""
import argparse, json, subprocess, urllib.request, urllib.error
parser=argparse.ArgumentParser();parser.add_argument('--email',required=True);parser.add_argument('--monthly-usd',type=int,required=True);args=parser.parse_args()
assert '@' in args.email and 1 <= args.monthly_usd <= 10000
project='quavi-dev-dc824';parent='projects/'+project
access=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
def api(url,method='GET',data=None):
    request=urllib.request.Request(url,method=method,headers={'Authorization':'Bearer '+access,'Content-Type':'application/json','x-goog-user-project':project},data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(request,timeout=60) as r:return json.load(r)
    except urllib.error.HTTPError as e:raise RuntimeError(f'{method} {url}: {e.code} {e.read().decode()}') from None
base='https://monitoring.googleapis.com/v3/'+parent
channels=api(base+'/notificationChannels').get('notificationChannels',[])
channel=next((x for x in channels if x.get('type')=='email' and x.get('labels',{}).get('email_address')==args.email),None)
if not channel:channel=api(base+'/notificationChannels','POST',{'type':'email','displayName':'Quavi dev operations','labels':{'email_address':args.email},'enabled':True})
channel_name=channel['name']
checks=api(base+'/uptimeCheckConfigs').get('uptimeCheckConfigs',[])
check=next((x for x in checks if x['displayName']=='Quavi dev database readiness'),None)
if not check:
    check=api(base+'/uptimeCheckConfigs','POST',{'displayName':'Quavi dev database readiness','monitoredResource':{'type':'uptime_url','labels':{'project_id':project,'host':'quavi-api-532892298664.us-central1.run.app'}},'httpCheck':{'path':'/readyz','port':443,'useSsl':True,'validateSsl':True,'requestMethod':'GET'},'period':'60s','timeout':'10s','selectedRegions':['USA']})
check_id=check['name'].split('/')[-1]
policies=api(base+'/alertPolicies').get('alertPolicies',[])
def policy(title,condition,details):
    data={'displayName':title,'enabled':True,'combiner':'OR','notificationChannels':[channel_name],'conditions':[condition], 'documentation':{'content':details+'\nSee server/OPERATIONS.md in david-cui-bruno/quavi. Do not paste user content or credentials into incidents.','mimeType':'text/markdown'},'alertStrategy':{'autoClose':'1800s'}}
    existing=next((x for x in policies if x['displayName']==title),None)
    if existing:
        data['name']=existing['name'];api('https://monitoring.googleapis.com/v3/'+existing['name']+'?updateMask=displayName,enabled,combiner,notificationChannels,conditions,documentation,alertStrategy','PATCH',data)
    else:api(base+'/alertPolicies','POST',data)
def threshold(title,filter,limit,duration,align,period='300s',count=1,details=''):
    policy(title,{'displayName':title,'conditionThreshold':{'filter':filter,'comparison':'COMPARISON_GT','thresholdValue':limit,'duration':duration,'aggregations':[{'alignmentPeriod':period,'perSeriesAligner':align}],'trigger':{'count':count}}},details)
policy('Quavi dev readiness unavailable',{'displayName':'Readiness failed in two locations for three minutes','conditionThreshold':{'filter':f'resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id="{check_id}"','comparison':'COMPARISON_LT','thresholdValue':1,'duration':'180s','aggregations':[{'alignmentPeriod':'60s','perSeriesAligner':'ALIGN_FRACTION_TRUE'}],'trigger':{'count':2}}},'Check Cloud Run revision, SQL connectivity and recent deployments. Readiness performs SELECT 1, not only process health.')
threshold('Quavi dev API server errors','resource.type="cloud_run_revision" AND resource.labels.service_name="quavi-api" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"',4,'0s','ALIGN_SUM',details='At least five server-error responses in five minutes on a revision. Check request logs without exposing authorization or user content.')
threshold('Quavi dev background job failed','resource.type="cloud_run_job" AND metric.type="run.googleapis.com/job/completed_execution_count" AND metric.labels.result="failed"',0,'0s','ALIGN_SUM',details='A migration, maintenance or push execution failed. Inspect that execution; fix the cause before retrying. Never roll schema migrations backwards automatically.')
for key,limit in [('disk',.8),('memory',.9)]:
    threshold('Quavi dev database '+key+' pressure',f'resource.type="cloudsql_database" AND resource.labels.database_id="{project}:quavi-dev-db" AND metric.type="cloudsql.googleapis.com/database/{key}/utilization"',limit,'600s','ALIGN_MEAN',details='Sustained database resource pressure. Check growth, connection counts and slow queries before resizing.')
billing='billingAccounts/01CBFA-F8F9FB-DE54D6'
budget_base='https://billingbudgets.googleapis.com/v1/'+billing+'/budgets'
budgets=api(budget_base).get('budgets',[])
data={'displayName':'Quavi dev monthly pre-credit alert budget','budgetFilter':{'projects':['projects/532892298664'],'calendarPeriod':'MONTH','creditTypesTreatment':'EXCLUDE_ALL_CREDITS'},'amount':{'specifiedAmount':{'currencyCode':'USD','units':str(args.monthly_usd)}},'thresholdRules':[{'thresholdPercent':x,'spendBasis':'CURRENT_SPEND'} for x in [.5,.9,1]],'notificationsRule':{'monitoringNotificationChannels':[channel_name],'disableDefaultIamRecipients':False}}
existing=next((x for x in budgets if x['displayName']==data['displayName']),None)
if existing:
    data['name']=existing['name'];api('https://billingbudgets.googleapis.com/v1/'+existing['name']+'?updateMask=displayName,budgetFilter,amount,thresholdRules,notificationsRule','PATCH',data)
else:existing=api(budget_base,'POST',data)
print(json.dumps({'uptimeCheck':check['name'],'alertPolicies':5,'notificationChannel':channel_name,'channelVerificationStatus':channel.get('verificationStatus','unspecified'),'budget':existing['name'],'monthlyUsd':args.monthly_usd,'creditTreatment':'EXCLUDE_ALL_CREDITS','shutdown':False},indent=2))
