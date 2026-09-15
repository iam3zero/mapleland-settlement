import Services from './settlement/Services'
import { SaveToast } from './settlement/feedback'
import { useHashRoute } from './settlement/useHashRoute'

const features = [
  { icon: 'boss', title: '보스 선택', description: '함께 공략한 보스를 선택하고\n우리 파티의 정산을 시작해요.', label: 'BOSS' },
  { icon: 'party', title: '파티원 관리', description: '함께한 파티원을 등록하고\n분배 인원을 한눈에 확인해요.', label: 'PARTY' },
  { icon: 'search', title: '아이템 검색', description: '획득한 아이템을 찾아 등록하고\n판매 금액을 입력해요.', label: 'ITEM' },
  { icon: 'calculator', title: '자동 정산', description: '수수료 5%를 제외한 금액을\n파티원에게 균등하게 나눠요.', label: 'SETTLEMENT' },
]

function Icon({ name, className = '' }) {
  const paths = {
    boss: <><path d="m5 3 4 4-2 2-4-4M19 3l-4 4 2 2 4-4M7 9l10 10M17 9 7 19M4 16l4 4M16 20l4-4" /><path d="m3 21 3-3m12 0 3 3" /></>,
    party: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M8 10.5h5m-2.5-2.5v5" /></>,
    calculator: <><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M8 6h8M8 10h8M8 14h1m6 0h1M8 18h1m6 0h1" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M15 8H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9m3-10v12" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  }
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Brand({ small = false }) {
  return <span className={`brand${small ? ' brand-small' : ''}`}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.4 5.1 3.4-1.7-.7 4.7 4.9 1.1-4.4 4 .8 2.6-5.4-.6V22h-2v-4.8l-5.4.6.8-2.6-4.4-4 4.9-1.1-.7-4.7 3.4 1.7Z" /></svg></span>메랜정산</span>
}

function SettlementPreview() {
  return (
    <section className="settlement-preview" aria-labelledby="preview-title">
      <div className="preview-topline"><span><span className="status-dot" />정산 미리보기</span><span className="sample-badge">예시</span></div>
      <div className="party-heading"><span className="boss-emblem"><Icon name="boss" /></span><div><h2 id="preview-title">오늘의 보스 파티</h2><p>함께한 모험, 깔끔한 마무리</p></div><span className="party-count"><Icon name="party" />6명</span></div>
      <dl className="calculation">
        <div><dt>아이템 판매 금액</dt><dd>60,000,000 <span>메소</span></dd></div>
        <div><dt>판매 수수료 <span className="fee-tag">5%</span></dt><dd className="deduction">−3,000,000 <span>메소</span></dd></div>
        <div className="subtotal"><dt>총 분배 금액</dt><dd>57,000,000 <span>메소</span></dd></div>
      </dl>
      <div className="payout"><div className="payout-label"><span>1인당 받을 금액</span><span className="equal-badge"><Icon name="check" />균등 분배</span></div><p><strong>9,500,000</strong><span>메소</span></p><div className="payout-bottom"><span className="mini-party" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index}><Icon name="party" /></span>)}</span><span>파티원 6명에게 공평하게</span></div></div>
      <p className="preview-note"><Icon name="check" />수수료 계산부터 분배까지, 한 번에</p>
    </section>
  )
}

function App() {
  const route = useHashRoute()
  return (
    <>
      <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); const main = document.getElementById('main'); main?.scrollIntoView(); main?.querySelector('h1')?.focus({ preventScroll: true }) }}>본문으로 바로가기</a>
      <header className="site-header"><div className="header-inner"><a className="brand-link" href="#/" aria-label="메랜정산 홈"><Brand /></a><div className="header-right"><a className="header-description" href="#/bosses">보스 정산</a><a className="header-rooms" href="#/rooms">정산방</a><a className="header-history" href="#/history">지난 정산 내역</a><a className="button button-secondary header-button" href="#features">이용 안내<Icon name="arrow" /></a></div></div></header>
      {route === '/' && <main id="main" className="page-container">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy"><span className="eyebrow"><span className="status-dot" />모험의 끝, 정산의 시작</span><h1 id="hero-title" tabIndex={-1}>보스 정산을<br /><span>간편하게</span> 시작하세요.</h1><p className="hero-description">파티원과 아이템을 등록하고<br />판매금액을 입력하면 자동으로 정산해드려요.</p><a className="button button-primary start-button" href="#/bosses">정산 시작하기<Icon name="arrow" /></a><p className="hero-footnote"><Icon name="check" />수수료 5% 자동 반영<span aria-hidden="true">·</span>공평한 균등 분배</p></div>
          <div className="preview-wrap"><SettlementPreview /></div>
        </section>
        <section id="features" className="features" aria-labelledby="features-title"><div className="section-heading"><div><p className="section-kicker">정산은 짧게, 모험은 길게</p><h2 id="features-title">복잡한 정산, 이젠 간단하게.</h2></div><p>파티 준비부터 분배까지, 한곳에서</p></div><div className="feature-grid">{features.map((feature, index) => <article className="feature-card" key={feature.icon}><div className="feature-top"><span className={`feature-icon feature-icon-${feature.icon}`}><Icon name={feature.icon} /></span><span className="feature-number">0{index + 1}</span></div><h3>{feature.title}</h3><p>{feature.description}</p><span className="feature-label">{feature.label}</span></article>)}</div></section>
        <aside className="fee-banner"><span className="fee-banner-icon"><Icon name="coin" /></span><div><h2>남는 건 즐거운 모험의 기억만.</h2><p>판매 금액에서 수수료 <strong>5%</strong>를 빼고, 나머지는 파티원 수대로 나눠요.</p></div><span className="fee-formula">판매 금액 × 0.95 ÷ 파티원 수</span></aside>
      </main>}
      <Services route={route} />
      <SaveToast />
      <footer className="site-footer"><div className="footer-inner"><p>© 2026 메랜정산. All rights reserved.</p><p>made by 채세영</p><p>Created for 베민혁</p></div></footer>
    </>
  )
}

export default App

