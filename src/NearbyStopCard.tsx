import {useState} from 'react';
import {useVenuePhoto,type VenueIdentity} from './venue-photos';
import {VenuePhotoSheet} from './VenuePhoto';
import {VenuePlaceholder} from './VenuePlaceholder';
import {Icon} from './Icons';
export function NearbyStopCard({venue,distance,onChoose}:{venue:VenueIdentity;distance:string;onChoose:()=>void}) {
  const {photo,imageFailed}=useVenuePhoto(venue);
  const [loaded,setLoaded]=useState(''),[credit,setCredit]=useState(false);
  const shown=!!photo && loaded===photo.url;
  return <div className={`nearby-stop ${shown?'with-photo':''}`}>
    <button className="nearby-stop-link" onClick={onChoose}>
      <VenuePlaceholder kind={venue.kind}/>
      {photo&&<img className="nearby-stop-photo" src={photo.url} alt="" referrerPolicy="no-referrer" onLoad={()=>setLoaded(photo.url)} onError={imageFailed}/>}
      <span className="nearby-stop-caption"><b>{venue.place}</b><span>{distance}</span></span>
    </button>
    {shown&&<button className="nearby-photo-credit" aria-label={`Photo credits for ${venue.place}`} onClick={()=>setCredit(true)}><Icon name="info" size={17}/></button>}
    {credit&&photo&&<VenuePhotoSheet photo={photo} onClose={()=>setCredit(false)}/>}
  </div>;
}
