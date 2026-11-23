// all the text the site says about me lives here (from my resume, nov 2026)
export type Exhibit = {
  id: string;            // 'A'..'Z'
  slug: string;
  title: string;
  board?: string;        // shorter polaroid label when the title is long
  kind: 'project' | 'research' | 'sealed'; // sealed = file opens once it ships
  tag: string;           // context line (event, year, team)
  summary: string;       // one line "what it is"
  evidence: string[];    // actual facts (none on a sealed file)
  stack: string[];
  links: { label: string; href: string }[];
  photo: string;         // /photos/<slug>.webp
  gallery?: string[];    // extra photos for the ExhibitPanel
  backNote: string;      // handwritten note on the back of the polaroid
  sample?: boolean;      // true = placeholder, replace later
};

export type Connection = { from: string; to: string; label: string };

export const caseFile = {
  caseNumber: '2316',
  subject: {
    name: 'Ayaan Bagawan',
    trade: 'Engineer (ECE) — web, hardware & design',
    institution: 'Dayananda Sagar University, Bengaluru — B.Tech ECE, 2025–2029',
    location: 'Bengaluru, India',
    status: 'Open to internships',
    photo: '/photos/ayaan.webp',
    email: 'ayaan.i.bagawan@gmail.com',
    phone: '+91 80889 29541',
    github: 'https://github.com/Ayaan2316',
    linkedin: 'https://linkedin.com/in/ayaan-bagawan-5a895137b',
    resumePdf: '/resume.pdf', // my actual resume (LaTeX), `pnpm resume:pdf` would overwrite it with a print of /resume
  },
  hero: {
    eyebrow: 'CONFIDENTIAL · CASE No. 2316',
    headline: 'Who is Ayaan Bagawan?',
    lede: 'Someone in Bengaluru has been building soccer robots, a desk pet and websites for real clients. Seven exhibits, two still sealed. One verdict. You are the detective.',
  },
  // cover story - what I do (OCCUPATION on the dossier, Experience on the resume)
  experience: [
    {
      org: 'Twilight',
      role: 'Co-founder, web design and development studio',
      when: 'Oct 2026 – present',
      link: { label: 'renderingtwilight.online', href: 'https://renderingtwilight.online' },
      points: [
        'Run a two-person studio that builds websites, web apps, mobile apps, UI designs and logos for small businesses; handle frontend design, client calls and project logistics',
        'Designed the UI/UX and frontend for the first paid client, Hashtag Optical: a React site for a two-branch optical store with local SEO, WhatsApp buttons and Maps directions. It now brings the store new customers',
        "Received 4–5 client enquiries before the studio's own website went live",
      ],
      links: [{ label: 'hashtagoptical.in', href: 'https://hashtagoptical.in' }],
    },
  ],
  education: [
    { school: 'Dayananda Sagar University', place: 'Bengaluru, Karnataka', detail: 'B.Tech in Electronics and Communication Engineering', when: '2025 – 2029 (expected)' },
    { school: "St. Paul's PU College", place: 'Belagavi', detail: 'Class XII, 83%', when: '2024' },
    { school: 'Bensons English Medium High School', place: 'Belagavi', detail: 'Class X, 95.5%', when: '2022' },
  ],
  // leadership + activities
  knownAssociates: [
    'Head Boy, Bensons English Medium High School: led school events, organised contests and workshops',
    'Stage Management, Cultural Team (CPA), DSU',
    'Member, Happiness Club, DSU',
    'Led teams at several hackathons',
  ],
  // achievements
  priorRecord: [
    '2nd place, Bharatiya Antariksh Hackathon 2025 (National Space Day), DSU: crop disease detection from satellite imagery',
    'JEE Main 2025: 91.38 percentile; qualified for JEE Advanced 2025',
    'Built Disha Edu, a learning platform for dyslexic students, and pitched it at several hackathons',
    'Competed in NASA Space Apps Challenge 2025, La Casa de Code: Techflix S2 and Prompt Wars (ACM DSU)',
  ],
  modusOperandi: 'Things that look good on the outside and go deep underneath.',
  // evidence room: one bag per tool and where I used it. full list is `skills`
  tools: [
    { name: 'React / Next.js', note: 'Hashtag Optical, this site' },
    { name: 'React Three Fiber', note: 'this office, live' },
    { name: 'GSAP', note: 'every scroll on this site' },
    { name: 'Blender', note: 'lit and baked this room' },
    { name: 'ESP32 / Arduino', note: 'Bumblebee, the desk pet' },
    { name: 'FPGA prototyping', note: 'Vivado, Spartan-7, Verilog' },
    { name: 'Python', note: 'Coco, the desktop cat' },
    { name: 'PyTorch', note: 'LLM Forge: a GPT from scratch' },
    { name: 'Figma', note: 'UI and brand design' },
  ],
  skills: [
    { group: 'Programming and web', items: ['C', 'Python', 'Verilog (basic)', 'HTML', 'CSS', 'React', 'Next.js', 'React Three Fiber', 'GSAP'] },
    { group: 'Hardware', items: ['ESP32', 'Arduino', 'Soldering', 'FPGA prototyping (Xilinx Vivado)', 'Multimeter', 'Oscilloscope', 'KiCad', 'Altium (learning)'] },
    { group: 'Design', items: ['Figma', 'Blender', 'Photoshop', 'Illustrator', 'Canva', 'Logo and brand design'] },
    { group: 'Data and AI', items: ['Excel', 'PyTorch', 'LLM training basics', 'Prompt engineering'] },
    { group: 'Writing', items: ['Technical writing', 'Research reports', 'Literature review', 'Content writing'] },
    { group: 'Languages', items: ['English', 'Hindi', 'Urdu', 'Marathi'] },
  ],
  certifications: [
    { title: 'VLSI Digital Design Flow and FPGA Prototyping', by: 'STMicroelectronics, NIT Trichy', detail: 'Vivado, Spartan-7, Verilog', when: 'Feb 2026' },
    { title: 'LLM Forge: From Code to Cognition', by: 'DSU', detail: 'Built and trained a GPT-style model from scratch in PyTorch', when: 'Oct 2026' },
    { title: 'Workshops', by: '', detail: 'Drone building (Team Roxx, DSU); Git and GitHub (DSU)', when: '' },
  ],
  exhibits: [
    {
      id: 'A', slug: 'bumblebee', kind: 'project', title: 'Bumblebee: Robo Soccer Bot', board: 'Bumblebee',
      tag: "CELESTAI'26 Robo Soccer finals · team of four · Apr 2026",
      summary: 'A Bluetooth-driven soccer robot that took a four-member team to the finals, out of 35+ teams.',
      evidence: [
        "Led the team to the Robo Soccer finals at CELESTAI'26, DSU's annual techfest (IEEE CASS and AESS SBCs), and drove the bot in matches",
        'Designed the sheet-metal chassis',
        'Built the electronics: an ESP32 over Bluetooth driving four 12V 1000 RPM Johnson geared motors through two dual motor drivers, on an 11.1V 3S LiPo',
      ],
      stack: ['ESP32', 'Arduino (C++)', 'Bluetooth'],
      links: [], photo: '/photos/bumblebee.webp',
      gallery: ['/photos/bumblebee-2.webp', '/photos/bumblebee-3.webp'],
      backNote: 'Made the final. Drove it himself.',
    },
    {
      id: 'B', slug: 'desk-pet', kind: 'project', title: 'AI Desk Pet',
      tag: 'Solo build · ESP32-S3 · in progress',
      summary: 'A desk robot with an animated face. Still on the breadboard.',
      evidence: [
        'An animated face, running on an ESP32-S3',
        'Planned: LLM voice chat',
        'Planned: face tracking',
      ],
      stack: ['ESP32-S3'],
      links: [], photo: '/photos/desk-pet.webp',
      gallery: ['/photos/desk-pet-2.webp', '/photos/desk-pet-3.webp', '/photos/desk-pet-4.webp'],
      backNote: 'Has a face. Working on a voice.',
    },
    {
      id: 'C', slug: 'case-file', kind: 'project', title: 'The Case File',
      tag: '3D interactive portfolio · 2026',
      summary: "The site you are standing in: a scroll-driven 3D portfolio set in a noir detective's office.",
      evidence: [
        'Lit in Blender Cycles and baked to lightmaps; flashlight, rain and neon run live in the browser',
        'Recruiter Mode: the same content as a plain HTML résumé, 100 in all four Lighthouse categories',
        'Every model, texture and font is CC0, CC-BY or OFL, and credited',
      ],
      stack: ['Next.js', 'React Three Fiber', 'GSAP', 'Blender'],
      links: [], photo: '/photos/case-file.webp',
      backNote: "You're standing in it.",
    },
    {
      // from the coco-desktop-pet README
      id: 'D', slug: 'coco', kind: 'project', title: 'Coco: AI Desktop Cat', board: 'Coco',
      tag: 'Solo build · Windows desktop pet + AI assistant · Nov 2026',
      summary: 'An animated white Persian kitten who lives on the Windows desktop and answers anything you ask, by text or voice, with a local AI that never leaves the PC.',
      evidence: [
        'Lives on the desktop: naps in her hammock bed, walks the taskbar, jumps onto windows (and falls when they move), purrs when petted with the cursor, and hides while a game or video is fullscreen',
        "Her brain runs on the laptop's own GPU (Ollama, qwen3.5): answers word by word with a matching face, has a mood, and remembers facts about you by meaning",
        'Talks in English and Hinglish ("Hey Coco" wake word, Whisper ears, Kokoro voice) and does PC tasks: screenshots, "what\'s this error?", apps, reminders, focus timers, music',
        'Ships as Coco.exe with an installer, plus a PIN-locked dashboard you can open from your phone',
      ],
      stack: ['Python', 'PySide6 (Qt)', 'Ollama', 'faster-whisper', 'Kokoro TTS', 'Blender', 'PyInstaller'],
      links: [], photo: '/photos/coco.webp',
      gallery: ['/photos/coco-2.webp', '/photos/coco-3.webp'],
      backNote: 'Lives on my desktop. Talks back.',
    },
    {
      id: 'E', slug: 'data-privacy', kind: 'research', title: 'Data Privacy Research Paper', board: 'Data Privacy',
      tag: 'Research · with a faculty mentor at DSU · in progress',
      summary: 'A research paper on data privacy, co-authored with a faculty mentor.',
      evidence: ['Details confidential until submission'],
      stack: [],
      links: [], photo: '/photos/data-privacy.webp',
      backNote: 'Classified. For now.',
    },
    {
      id: 'F', slug: 'sealed-f', kind: 'sealed', title: 'Sealed',
      tag: 'Case still open',
      summary: 'Still in the workshop. This file opens when it ships.',
      evidence: [], stack: [],
      links: [], photo: '/photos/sealed-f.webp',
      backNote: 'Coming soon.',
    },
    {
      id: 'G', slug: 'sealed-g', kind: 'sealed', title: 'Sealed',
      tag: 'Case still open',
      summary: 'Still in the workshop. This file opens when it ships.',
      evidence: [], stack: [],
      links: [], photo: '/photos/sealed-g.webp',
      backNote: 'Watch this space.',
    },
  ] satisfies Exhibit[],
  connections: [
    { from: 'A', to: 'B', label: 'ESP32' },
    { from: 'B', to: 'D', label: 'DESK PETS' },
    { from: 'B', to: 'C', label: 'SOLO BUILDS' },
    { from: 'D', to: 'E', label: 'PRIVACY' },
    { from: 'C', to: 'F', label: 'NEXT?' },
    { from: 'F', to: 'G', label: 'PENDING' }, // not E-G: that string crossed F and its tag hid F's label
  ] satisfies Connection[],
  transcript: [
    { q: 'State your trade.', a: 'Electronics and Communication Engineering at DSU. On the side, Twilight: a two-person web studio.' },
    { q: 'Tools found at the scene?', a: 'React and Next.js. ESP32 and Arduino. Blender, Figma, PyTorch. An FPGA, in Vivado.' },
    { q: "So you're an expert.", a: "No. Still learning every one of them. That's kind of the point." },
    { q: 'Prior record?', a: "Second place at the Bharatiya Antariksh Hackathon. The Robo Soccer finals at CELESTAI'26. JEE Main, 91.38 percentile." },
    { q: 'Motive?', a: 'Things that look good on the outside and go deep underneath.' },
  ],
  verdict: {
    stamp: 'GUILTY',
    charge: 'of building too many things at once.',
    sentence: 'Hire him. Or at least put him on your hackathon team.',
  },
  contact: {
    prompt: 'Pick up the phone',
    formTitle: 'Leave a tip',
    footer: 'Case closed? Not yet. Status: open to internships.',
    submit: 'File the tip',
    filed: 'TIP FILED',
    filedNote: 'Got it. The tip is on file, and the reply goes to the address you left.',
    failed: "The line went dead and the tip didn't go through. Try again, or write directly:",
    resume: 'Get the résumé',
    openResume: 'Open the résumé',
    closeResume: 'Close the résumé',
  },
  // sound starts off (browsers need a click first), the opening offers it
  sound: { prompt: 'Turn the sound on' },
  notFound: {
    eyebrow: '404 · NO SUCH FILE',
    title: 'Case not found',
    body: "Nothing is filed under this address. Misfiled, or someone wants you looking in the wrong drawer.",
  },
  // for when the 3D can't run well. stills are the scenes as rendered, in story order
  // (the lite file opens on the office one)
  fallback: {
    // shown when the 3D can't keep up on this computer (SlowNotice)
    slowPrompt: "The 3D is running slowly on this computer.",
    switchToLite: "Switch to the lite file",
    keep3d: "Keep the 3D",
    stills: [
      { src: '/images/stills/corridor_mid.webp', alt: 'A dim old corridor ending at a frosted-glass door lettered Ayaan Bagawan' },
      { src: '/images/stills/corridor_door.webp', alt: 'The frosted office door, lettered Ayaan Bagawan, Engineering & Investigations, beside room plate 2316' },
      { src: '/images/stills/office_establishing.webp', alt: 'A dark office: evidence board, floating shelves, a desk with a typewriter and rotary phone' },
      { src: '/images/stills/office_desk.webp', alt: 'The desk: typewriter, case folder marked classified, rotary phone, filter coffee' },
      { src: '/images/stills/office_window.webp', alt: 'Rain-lit blinds over the city at night, a red neon sign glowing through the slats' },
      { src: '/images/stills/evidence_wide.webp', alt: 'The evidence room: a steel table of numbered evidence bags under one lamp, case boxes on the shelves' },
      { src: '/images/stills/interrogation_room.webp', alt: 'The interrogation room: a reel-to-reel recorder, a case file and a stamp under a hanging lamp, a one-way mirror behind' },
    ],
  },
  // lite file - the whole case on paper for phones and older computers
  lite: {
    open: 'Open the file',
    open3d: 'Open the 3D case file',
    // why you're reading the lite file (mode.ts sets `data-lite` on <html>)
    notes: {
      default: 'The lite file, for phones and older computers.',
      phone: 'The lite file, made for phones. The 3D case file is built for laptops.',
      old: 'The lite file, made for older computers.',
      none: "This browser can't run the 3D case file, so here's the lite file.",
      software: "This computer draws graphics without a graphics chip, too slowly for the 3D case file, so here's the lite file.",
      slow: "The 3D case file was running too slowly on this computer, so here's the lite file.",
      lost: "The graphics driver stopped the 3D case file, so here's the lite file.",
    },
    contents: 'In this file',
    // in-world name, the plain one under each sheet's heading, and a short one for the index card
    sections: {
      profile: ['Subject profile', 'About', 'About'],
      experience: ['Cover story', 'Experience', 'Experience'],
      board: ['Evidence board', 'Projects and research', 'Projects'],
      log: ['Evidence log', 'Tools and skills', 'Skills'],
      record: ['Prior record', 'Achievements and education', 'Record'],
      interview: ['Interrogation', 'Q&A', 'Q&A'],
      contact: ['Tip line', 'Contact', 'Contact'],
    },
    photoCaption: 'the subject',
    // printed labels on the subject profile
    fields: { name: 'Name', trade: 'Trade', institution: 'Institution', location: 'Based in', status: 'Status', mo: 'Modus operandi' },
    knownAddresses: 'Known addresses',
    lines: { call: 'Call', phone: 'Phone', email: 'Email', github: 'GitHub', linkedin: 'LinkedIn', resume: 'Résumé' },
    boardHint: 'Pick a photo to open its file.',
    // an exhibit's file, opened over the board
    backToBoard: 'Back to the board',
    prev: 'Previous',
    next: 'Next',
    kinds: { project: 'Project', research: 'Research', sealed: 'Sealed' },
    findings: 'Findings',
    toolsRecovered: 'Tools recovered',
    logItem: 'Item',
    logWhere: 'Where it turned up',
    inventory: 'Full inventory',
    achievements: 'Achievements',
    education: 'Education',
    certifications: 'Certifications and workshops',
    associates: 'Known associates',
    verdict: 'Verdict',
    sentence: 'Sentence',
    recruiterCopy: 'Recruiter copy',
    backToTop: 'Back to the top',
    noScript: 'The tip form needs JavaScript. Call or email instead: both are right here.',
  },
};
