/** Empty and placeholder contact names are missing information, never a shared identity. */
export function clientContactName(value?:string|null):string{
 const name=value?.trim().replace(/\s+/g," ")||"";
 if(!/[\p{L}\p{N}]/u.test(name)||/^(none|n\/?a|unknown|unnamed (client|lead)|not (provided|recorded|set))$/i.test(name))return "";
 return name;
}
type Person={name?:string;contactName?:string;companyName?:string;organizations?:string[];email?:string};
export function normalizedClientName(value?:string|null):string{
 return clientContactName(value).normalize("NFKC").replace(/\s+/g," ").toLowerCase();
}
export function clientIdentityExists(input:Person,clients:Person[]):boolean{
 const name=normalizedClientName(input.contactName??input.name),company=normalizedClientName(input.companyName);
 return clients.some(client=>
  (!!name&&name===normalizedClientName(client.contactName??client.name))||
  (!!company&&(client.organizations||[client.companyName||""]).some(value=>normalizedClientName(value)===company))
 );
}
export function clientContactMatches(customer:Person,person:Person):boolean{
 const email=customer.email?.trim().toLowerCase(),otherEmail=person.email?.trim().toLowerCase();
 if(email&&otherEmail)return email===otherEmail;
 const name=clientContactName(customer.contactName??customer.name).toLowerCase(),otherName=clientContactName(person.contactName??person.name).toLowerCase();
 if(name&&otherName)return name===otherName;
 if(!name){
  const company=clientContactName(person.companyName).toLowerCase();
  return !!company&&(customer.organizations||[customer.companyName||""]).some(value=>clientContactName(value).toLowerCase()===company);
 }
 return false;
}
