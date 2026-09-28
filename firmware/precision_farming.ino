/* Precision Farming controller — STAND_01
   Requires Firebase_ESP_Client and ModbusMaster. Copy secrets_template.h to
   secrets.h and fill it locally; never commit device credentials. */
#include <WiFi.h>
#include <ModbusMaster.h>
#include <Firebase_ESP_Client.h>
#include <time.h>
#include <Preferences.h>
#include "secrets.h"
#include "addons/TokenHelper.h"

constexpr char FARM_ID[] = "FARM_001";
constexpr char STAND_ID[] = "STAND_01";
constexpr uint32_t TELEMETRY_INTERVAL_MS = 60000;
constexpr uint32_t STATUS_INTERVAL_MS = 15000;
constexpr int RS485_RX_PIN = 16, RS485_TX_PIN = 17, RS485_DE_RE_PIN = 15;
constexpr uint16_t REG_7IN1_HUMIDITY = 0x0000;

struct NodeConfig { const char* id; uint8_t address; };
NodeConfig nodes[]={{"NODE_01",1},{"NODE_02",2},{"NODE_03",3},{"NODE_04",4},{"NODE_05",5},{"NODE_06",6}};
constexpr size_t NODE_COUNT=sizeof(nodes)/sizeof(nodes[0]);
struct Reading { float moisture,temperature,ec,ph,nitrogen,phosphorus,potassium; bool valid; String error; };

FirebaseData fbdo; FirebaseAuth auth; FirebaseConfig config; ModbusMaster modbus; Preferences processed;
uint32_t lastTelemetry=0,lastStatus=0,telemetrySequence=0; uint8_t processedSlot=0;

void preTransmission(){digitalWrite(RS485_DE_RE_PIN,HIGH);}
void postTransmission(){digitalWrite(RS485_DE_RE_PIN,LOW);}
uint64_t nowMs(){time_t t=time(nullptr);return t>1700000000?(uint64_t)t*1000:millis();}
String standPath(){return String("/farms/")+FARM_ID+"/stands/"+STAND_ID;}
String commandPath(const String&id){return standPath()+"/commands/"+id;}
String processedKey(uint8_t slot){return String("cmd")+String(slot);}
bool commandProcessed(const String&id){for(uint8_t i=0;i<12;i++){String key=processedKey(i);if(processed.getString(key.c_str(),"")==id)return true;}return false;}
void rememberCommand(const String&id){String key=processedKey(processedSlot);processed.putString(key.c_str(),id);processedSlot=(processedSlot+1)%12;}

void connectWiFi(){
  if(WiFi.status()==WL_CONNECTED)return;
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
}
void configureFirebase(){
  config.api_key=FIREBASE_API_KEY; config.database_url=FIREBASE_DATABASE_URL;
  auth.user.email=DEVICE_EMAIL; auth.user.password=DEVICE_PASSWORD;
  config.token_status_callback=tokenStatusCallback;
  Firebase.begin(&config,&auth); Firebase.reconnectWiFi(true);
}
Reading readNode(uint8_t address){
  Reading r={}; r.valid=false; r.error="MODBUS_TIMEOUT";
  modbus.begin(address,Serial2);
  if(modbus.readHoldingRegisters(REG_7IN1_HUMIDITY,7)!=modbus.ku8MBSuccess)return r;
  r.moisture=modbus.getResponseBuffer(0)/10.0f;
  r.temperature=modbus.getResponseBuffer(1)/10.0f;
  r.ec=modbus.getResponseBuffer(2); r.ph=modbus.getResponseBuffer(3)/10.0f;
  r.nitrogen=modbus.getResponseBuffer(4); r.phosphorus=modbus.getResponseBuffer(5); r.potassium=modbus.getResponseBuffer(6);
  r.valid=true; r.error=""; return r;
}
FirebaseJson telemetryJson(const Reading&r){
  FirebaseJson j;j.set("measured_at",(double)nowMs());j.set("sequence",++telemetrySequence);
  const char* fields[]={"moisture","temperature","ec","ph","nitrogen","phosphorus","potassium"};
  if(r.valid){
    float values[]={r.moisture,r.temperature,r.ec,r.ph,r.nitrogen,r.phosphorus,r.potassium};
    for(size_t i=0;i<7;i++){j.set(String(fields[i])+"/value",values[i]);j.set(String(fields[i])+"/valid",true);}
  }else for(size_t i=0;i<7;i++){j.set(String(fields[i])+"/value",nullptr);j.set(String(fields[i])+"/valid",false);j.set(String(fields[i])+"/error",r.error);}
  return j;
}
void writeReading(const NodeConfig& node,const Reading&r){
  String base=standPath()+"/nodes/"+node.id; FirebaseJson t=telemetryJson(r),status;
  Firebase.RTDB.setJSON(&fbdo,base+"/current",&t); Firebase.RTDB.pushJSON(&fbdo,base+"/logs",&t);
  status.set("state",r.valid?"ONLINE":r.error);status.set("last_seen",(double)nowMs());status.set("rs485_ok",r.valid);
  if(r.valid)status.set("last_success_at",(double)nowMs());
  if(!r.valid)status.set("last_error",r.error);else status.set("last_error",nullptr);
  Firebase.RTDB.setJSON(&fbdo,base+"/status",&status);
}
void uploadTelemetry(){for(auto& node:nodes){Reading r=readNode(node.address);writeReading(node,r);}}
void writeController(){
  FirebaseJson c;c.set("mac_address",WiFi.macAddress());c.set("online",WiFi.status()==WL_CONNECTED&&Firebase.ready());c.set("last_seen",(double)nowMs());c.set("wifi_rssi",WiFi.RSSI());c.set("firebase_connected",Firebase.ready());c.set("sd_ready",false);c.set("firmware_version","2.0.0");
  Firebase.RTDB.setJSON(&fbdo,standPath()+"/controller",&c);
}
void writeCommandFailureAlert(const String&id,const char*code,const char*message){
  FirebaseJson alert;String alertId="ALERT_"+id;
  alert.set("alert_id",alertId);alert.set("type",code);alert.set("severity",!strcmp(code,"COMMAND_EXPIRED")?"WARNING":"CRITICAL");alert.set("message",message);alert.set("created_at",(double)nowMs());alert.set("updated_at",(double)nowMs());alert.set("resolved",false);
  Firebase.RTDB.setJSON(&fbdo,standPath()+"/alerts/"+alertId,&alert);
}
void writeCommandAudit(const String&commandId,const String&operationId,const char*status,const char*error){
  uint64_t at=nowMs();FirebaseJson audit;String eventId="AUDIT_"+commandId+"_"+String(status)+"_"+String(at);
  audit.set("action","COMMAND_STATUS");audit.set("command_id",commandId);audit.set("operation_id",operationId);audit.set("status",status);audit.set("farm_id",FARM_ID);audit.set("stand_id",STAND_ID);audit.set("at",(double)at);if(error)audit.set("error_code",error);
  Firebase.RTDB.setJSON(&fbdo,"/system/audit/"+eventId,&audit);
}
void setCommandStatus(const String&id,const char*status,const char*error=nullptr){
  String p=commandPath(id);Firebase.RTDB.setString(&fbdo,p+"/status",status);
  if(!strcmp(status,"RECEIVED"))Firebase.RTDB.setDouble(&fbdo,p+"/received_at",nowMs());
  if(!strcmp(status,"EXECUTING"))Firebase.RTDB.setDouble(&fbdo,p+"/started_at",nowMs());
  if(!strcmp(status,"COMPLETED"))Firebase.RTDB.setDouble(&fbdo,p+"/completed_at",nowMs());
  const char* errorMessage=!error?nullptr:!strcmp(error,"COMMAND_EXPIRED")?"Command expired before the controller processed it.":"Actuator hardware is not configured for this controller.";
  if(error){Firebase.RTDB.setString(&fbdo,p+"/error_code",error);Firebase.RTDB.setString(&fbdo,p+"/error_message",errorMessage);writeCommandFailureAlert(id,error,errorMessage);}
  // The dashboard follows the authoritative operation record; the controller may
  // only update execution fields, never create or rewrite the operation payload.
  if(Firebase.RTDB.getString(&fbdo,p+"/operation_id")){
    String operationId=fbdo.stringData();String operationPath=standPath()+"/operations/"+operationId;
    Firebase.RTDB.setString(&fbdo,operationPath+"/status",status);
    if(error){Firebase.RTDB.setString(&fbdo,operationPath+"/error_code",error);Firebase.RTDB.setString(&fbdo,operationPath+"/error_message",errorMessage);}
    writeCommandAudit(id,operationId,status,error);
  }
}
void processCommands(){
  if(!Firebase.ready()||!Firebase.RTDB.getJSON(&fbdo,standPath()+"/commands"))return;
  FirebaseJson& json=fbdo.jsonObject(); size_t count=json.iteratorBegin(); String id,type,status;
  for(size_t i=0;i<count;i++){int kind;String key,value;json.iteratorGet(i,kind,key,value);if(!key.endsWith("/status")||value!="PENDING")continue;id=key.substring(0,key.length()-7);id=id.substring(id.lastIndexOf('/')+1);if(commandProcessed(id))continue;
    FirebaseJsonData expires;json.get(expires,id+"/expires_at");if(expires.success&&expires.doubleValue>0&&nowMs()>expires.doubleValue){setCommandStatus(id,"FAILED","COMMAND_EXPIRED");rememberCommand(id);continue;}
    setCommandStatus(id,"RECEIVED");setCommandStatus(id,"EXECUTING");
    // Deliberately fail closed until valve pins, pump driver, flow meter, and safety interlocks are verified.
    setCommandStatus(id,"FAILED","ACTUATOR_NOT_CONFIGURED");rememberCommand(id);
  }json.iteratorEnd();
}
void seedMetadata(){
  FirebaseJson m;m.set("stand_id",STAND_ID);m.set("name","Stand 01");m.set("active",true);m.set("node_count",(int)NODE_COUNT);Firebase.RTDB.setJSON(&fbdo,standPath()+"/metadata",&m);
  for(auto& n:nodes){FirebaseJson x;x.set("node_id",n.id);x.set("position",n.address);x.set("sensor_type","CWT_7_IN_1");x.set("modbus_address",n.address);x.set("enabled",true);Firebase.RTDB.setJSON(&fbdo,standPath()+"/nodes/"+n.id+"/metadata",&x);}
}
void setup(){Serial.begin(115200);processed.begin("precision",false);pinMode(RS485_DE_RE_PIN,OUTPUT);digitalWrite(RS485_DE_RE_PIN,LOW);Serial2.begin(4800,SERIAL_8N1,RS485_RX_PIN,RS485_TX_PIN);modbus.preTransmission(preTransmission);modbus.postTransmission(postTransmission);connectWiFi();configTime(0,0,"pool.ntp.org");configureFirebase();}
void loop(){connectWiFi();if(Firebase.ready()){if(lastStatus==0){seedMetadata();lastStatus=millis();}processCommands();if(millis()-lastTelemetry>=TELEMETRY_INTERVAL_MS){uploadTelemetry();lastTelemetry=millis();}if(millis()-lastStatus>=STATUS_INTERVAL_MS){writeController();lastStatus=millis();}}}
