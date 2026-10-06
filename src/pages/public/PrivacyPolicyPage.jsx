import BrandLogo from '../../components/brand/BrandLogo';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#faf7f2] text-[#24211e]">
      <header className="border-b border-[#eee4d5] bg-white px-6 py-4 sm:px-12">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="/" aria-label="Wrap and Roll home"><BrandLogo /></a>
          <a href="/" className="text-sm font-semibold text-[#ae002a] hover:underline">Back to website</a>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
        <p className="text-xs font-bold uppercase tracking-wider text-[#ae002a]">Wrap &amp; Roll Tanzania</p>
        <h1 className="mt-3 text-4xl font-bold text-[#1f1d1b]">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[#746e67]">Last updated: September 5, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-[#554e46]">
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Information we collect</h2><p className="mt-2">When you place an order or contact us, we may collect your name, phone number, email address, delivery details, payment reference, and order information. Staff accounts also contain operational profile and activity information.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">How we use information</h2><p className="mt-2">We use this information to process orders, coordinate delivery or dine-in service, respond to support requests, manage restaurant operations, authenticate staff, and improve our services.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Marketing email</h2><p className="mt-2">If you separately opt in to restaurant news and offers, we use your email address and basic preference or visit information to send relevant marketing updates. We send a confirmation email before activating a subscription. You can unsubscribe from any marketing email; unsubscribed addresses are suppressed from future campaigns. Email delivery providers process messages on our behalf. Campaign systems may record delivery, open, click, bounce, and unsubscribe events to operate and improve email delivery. Order receipts and service messages are separate from optional marketing email.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Payments</h2><p className="mt-2">Payment references are used to reconcile orders. We do not store card numbers in this application. Mobile-money payments are completed through the payment instructions shown at checkout.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Roadside order location</h2><p className="mt-2">If you choose roadside handoff and explicitly start location sharing, your device may send precise location updates for that order so staff can coordinate a safe handoff. Sharing is optional and can be stopped at any time. We stop accepting location updates when the trip ends and delete the trip trail after seven days. Map services may process tile requests to display the map.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Data storage and security</h2><p className="mt-2">Operational records are stored in our restaurant database and protected with access controls. We retain orders, customer records, staff activity, and settings as needed to operate the restaurant and meet accounting or support obligations.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Sharing</h2><p className="mt-2">We do not sell personal information. We share information only with service providers or staff when necessary to process an order, provide support, complete a payment, or comply with applicable law.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Your choices</h2><p className="mt-2">You may contact us to ask about personal information associated with your orders or request a correction where appropriate. Some records may need to be retained for legal, security, or accounting reasons.</p></section>
          <section><h2 className="text-xl font-bold text-[#1f1d1b]">Contact</h2><p className="mt-2">For privacy questions, contact <a className="font-semibold text-[#ae002a] hover:underline" href="mailto:info@wrapandrolltz.com">info@wrapandrolltz.com</a> or call +255 746 222 889.</p></section>
        </div>
      </article>
    </main>
  );
}
