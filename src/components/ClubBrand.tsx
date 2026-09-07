import crest from '../../logo1.png'
import shirt from '../../logo2.jpg'

export function ClubCrest() {
  return <img className="club-crest" src={crest} alt="Mánudagsboltinn" width={1012} height={1094}/>
}

export function ClubWelcome() {
  return <div className="club-welcome">
    <img src={shirt} alt="Merki Mánudagsboltans á dökkblárri treyju" width={1152} height={1536}/>
    <p>Þar sem kappið ber<br/>fegurðina ofurliði.</p>
  </div>
}
