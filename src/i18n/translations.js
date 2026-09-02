const translations = {
  English: {
    home: 'Home', about: 'About Us', orderOnline: 'Order Online', reservation: 'Reservation', contact: 'Contact Us', cart: 'Cart', login: 'Login to continue',
    heroEyebrow: 'FRESH INGREDIENTS, GREAT TASTE', heroTitle: 'Dine with Delight at', heroIntro: 'Satisfy your cravings with delicious meals made fresh for every kind of gathering, from a quick bite to a special celebration.', exploreMenu: 'Explore our menu', findOutlet: 'Find an outlet',
    careEyebrow: 'EVERY DISH MADE WITH CARE', careTitle: 'Good food starts with a little more care.', careBody: 'We bring together fresh ingredients, generous portions, and bold flavors to make food worth gathering around. Every wrap, roll, and side is prepared with the same attention we would give our own table.', checkMenu: 'Check our menu', menuEyebrow: 'EXPLORE OUR DELICIOUS MENU', menuTitle: 'Tasty dishes for every taste', allMenu: 'All menu', wraps: 'Signature wraps', salads: 'Fresh salads', rolls: 'Fresh rolls', pizzas: 'Pizza', burgers: 'Burgers', combos: 'Combo meals', sides: 'Sides', coffee: 'Coffee', coldDrinks: 'Cold drinks', softDrinks: 'Soft drinks', drinks: 'Drinks',
    visitEyebrow: 'VISIT US', visitTitle: 'Find us at Wikicha Tower.', openMaps: 'Open in Google Maps', community: 'A COMMUNITY', galleryTitle: 'Photos of our delicious foods', getInTouch: 'GET IN TOUCH', contactTitle: 'Come by, call us, or order from home.', onlineOrder: 'ONLINE ORDER', yourOrder: 'Your order', placeOrder: 'Place delivery order',
    chatTitle: 'Wrap & Roll chat', chatGreeting: 'Hello. How can we help with your order?', chatPlaceholder: 'Type a message...', send: 'Send', chatMenu: 'What is on the menu?', chatHours: 'What are your opening hours?', chatLocation: 'Where are you located?', chatMenuReply: 'You can browse our fresh wraps, rolls, sides, and drinks in the menu above.', chatHoursReply: 'We are open daily from 7:00 AM to 11:00 PM.', chatLocationReply: 'We are at Wikicha Tower, Mwai Kibaki Road, Dar es Salaam.',
  },
  Swahili: {
    home: 'Nyumbani', about: 'Kuhusu Sisi', orderOnline: 'Agiza Mtandaoni', reservation: 'Uhifadhi', contact: 'Wasiliana Nasi', cart: 'Kikapu', login: 'Ingia kuendelea',
    heroEyebrow: 'VIUNGO VIPYA, LADHA KUBWA', heroTitle: 'Furahia Chakula Kitamu Wrap & Roll', heroIntro: 'Timiza hamu yako kwa vyakula vitamu vilivyotengenezwa vipya kwa kila aina ya hafla, kuanzia mlo wa haraka hadi sherehe maalum.', exploreMenu: 'Tazama menyu yetu', findOutlet: 'Tafuta tawi',
    careEyebrow: 'KILA MLO UMETENGENEZWA KWA UMAKINI', careTitle: 'Chakula kizuri huanza kwa kujali zaidi.', careBody: 'Tunakusanya viungo vipya, sehemu za kutosha na ladha bora ili kutengeneza chakula cha kufurahia pamoja. Kila wrap, roll na kitoweo huandaliwa kwa umakini ule ule wa meza yetu.', checkMenu: 'Angalia menyu yetu', menuEyebrow: 'ANGALIA MENYU YETU TAMU', menuTitle: 'Milo tamu kwa kila ladha', allMenu: 'Menyu yote', wraps: 'Wrap maalum', salads: 'Saladi mpya', rolls: 'Roll mpya', pizzas: 'Pizza', burgers: 'Burger', combos: 'Milo ya pamoja', sides: 'Vitoweo', coffee: 'Kahawa', coldDrinks: 'Vinywaji baridi', softDrinks: 'Soda', drinks: 'Vinywaji',
    visitEyebrow: 'TUTEMBELEE', visitTitle: 'Tupate Wikicha Tower.', openMaps: 'Fungua Google Maps', community: 'JAMII', galleryTitle: 'Picha za vyakula vyetu vitamu', getInTouch: 'WASILIANA NASI', contactTitle: 'Tupitie, tupigie simu au agiza ukiwa nyumbani.', onlineOrder: 'AGIZO LA MTANDAONI', yourOrder: 'Agizo lako', placeOrder: 'Weka agizo la delivery',
    chatTitle: 'Mazungumzo ya Wrap & Roll', chatGreeting: 'Habari. Tunaweza kukusaidia na agizo lako?', chatPlaceholder: 'Andika ujumbe...', send: 'Tuma', chatMenu: 'Mna menyu gani?', chatHours: 'Mnafungua saa ngapi?', chatLocation: 'Mko wapi?', chatMenuReply: 'Unaweza kuangalia wraps, rolls, vitoweo na vinywaji kwenye menyu hapo juu.', chatHoursReply: 'Tuko wazi kila siku kuanzia saa 1:00 asubuhi hadi saa 5:00 usiku.', chatLocationReply: 'Tupo Wikicha Tower, Mwai Kibaki Road, Dar es Salaam.',
  },
};

export function translate(language, key) {
  return translations[language]?.[key] || translations.English[key] || key;
}

export default translations;