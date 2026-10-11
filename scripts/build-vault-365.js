const fs = require('fs');
const path = require('path');

const VAULT_FILE = path.join(__dirname, '..', 'data', 'vault_365.json');
const CATALOG_FILE = path.join(__dirname, '..', 'data', 'catalog.json');

// Curated master list of top historic vinyl landmarks
const MASTER_PICKS = [
  // JAZZ & MODAL MASTERPIECES
  { artist: "Miles Davis", title: "Kind of Blue", year: 1959, genre: "Modal Jazz", tagline: "The best-selling jazz record in history; pristine modal improvisation and open room acoustics." },
  { artist: "John Coltrane", title: "A Love Supreme", year: 1965, genre: "Spiritual Jazz", tagline: "A profound spiritual suite recorded in a single four-part session on Van Gelder tape." },
  { artist: "Dave Brubeck Quartet", title: "Time Out", year: 1959, genre: "Cool Jazz", tagline: "Groundbreaking asymmetric time signatures featuring the iconic audiophile benchmark Take Five." },
  { artist: "Bill Evans Trio", title: "Sunday at the Village Vanguard", year: 1961, genre: "Post-Bop", tagline: "The pinnacle of empathetic piano trio conversation, recorded live on analog tape." },
  { artist: "Charles Mingus", title: "Mingus Ah Um", year: 1959, genre: "Hard Bop", tagline: "Combines blues roots, gospel shouts, and fierce ensemble composition." },
  { artist: "Thelonious Monk", title: "Brilliant Corners", year: 1957, genre: "Bebop / Hard Bop", tagline: "Angular, genius compositions with complex polyphony that pushed analog cutting heads to the limit." },
  { artist: "Herbie Hancock", title: "Head Hunters", year: 1973, genre: "Jazz-Funk", tagline: "An electrifying fusion milestone that defined 1970s clavinet funk and analog synth bass." },
  { artist: "Wayne Shorter", title: "Speak No Evil", year: 1966, genre: "Post-Bop", tagline: "Darkly mystical compositions and peak Blue Note hard bop synergy." },
  { artist: "Chet Baker", title: "Chet Baker Sings", year: 1954, genre: "West Coast Cool", tagline: "Intimate, breathy vocal phrasing that demands quiet 180g vinyl playback." },
  { artist: "Cannonball Adderley", title: "Somethin' Else", year: 1958, genre: "Hard Bop", tagline: "Features Miles Davis as sideman on a peerless, melancholic rendition of Autumn Leaves." },
  { artist: "Art Blakey & The Jazz Messengers", title: "Moanin'", year: 1958, genre: "Hard Bop", tagline: "The quintessential Blue Note manifesto: driving swing, church-chords, and blistering brass." },
  { artist: "Stan Getz & João Gilberto", title: "Getz/Gilberto", year: 1964, genre: "Bossa Nova / Jazz", tagline: "The worldwide bossa nova explosion with Astrud Gilberto's timeless, whispered vocals." },
  { artist: "Sonny Rollins", title: "Saxophone Colossus", year: 1956, genre: "Hard Bop", tagline: "St. Thomas and Blue 7 demonstrate peak thematic improvisation captured by Rudy Van Gelder." },
  { artist: "Eric Dolphy", title: "Out to Lunch!", year: 1964, genre: "Avant-Garde Jazz", tagline: "Vibraphone, bass clarinet, and daring microtonal structures in legendary Blue Note hi-fi." },
  { artist: "Alice Coltrane", title: "Journey in Satchidananda", year: 1971, genre: "Spiritual Jazz", tagline: "Harp, tamboura, and Pharoah Sanders' soprano sax weaving transcendent modal tapestries." },
  { artist: "Donald Byrd", title: "Places and Spaces", year: 1975, genre: "Jazz-Funk", tagline: "Produced by the Mizell Brothers; lush strings, analog synths, and pure golden-era groove." },
  { artist: "Grant Green", title: "Idle Moments", year: 1965, genre: "Soul Jazz", tagline: "A nocturnal 15-minute title track characterized by warm hollowbody guitar tone." },
  { artist: "Lee Morgan", title: "The Sidewinder", year: 1964, genre: "Soul Jazz", tagline: "The boogaloo-infused crossover hit that single-handedly funded Blue Note's mid-60s roster." },
  { artist: "Freddie Hubbard", title: "Red Clay", year: 1970, genre: "CTI Soul Jazz", tagline: "Features Herbie Hancock on Fender Rhodes and Ron Carter on acoustic bass." },
  { artist: "Keith Jarrett", title: "The Köln Concert", year: 1975, genre: "Solo Piano / ECM", tagline: "The best-selling solo piano album in history; spontaneous, soaring analog acoustics." },
  { artist: "Weather Report", title: "Heavy Weather", year: 1977, genre: "Jazz Fusion", tagline: "Features Jaco Pastorius' fretless bass virtuosity on Birdland and A Remark You Made." },
  { artist: "Kamasi Washington", title: "The Epic", year: 2015, genre: "Contemporary Spiritual Jazz", tagline: "A 3-LP triple gatefold opus proving the 21st-century resurgence of large-ensemble spiritual jazz." },

  // CLASSIC ROCK, PSYCHEDELIA & PROG
  { artist: "Pink Floyd", title: "The Dark Side of the Moon", year: 1973, genre: "Progressive Rock", tagline: "The ultimate hi-fi test record: heartbeat kicks, tape-loop clocks, and sweeping synthesizers." },
  { artist: "Pink Floyd", title: "Wish You Were Here", year: 1975, genre: "Progressive Rock", tagline: "A four-movement analog lament dedicated to Syd Barrett with pristine room reverberation." },
  { artist: "The Beatles", title: "Abbey Road", year: 1969, genre: "Classic Rock", tagline: "The final recorded Beatles masterpiece, culminating in the seamless eight-song side-two medley." },
  { artist: "The Beatles", title: "Sgt. Pepper's Lonely Hearts Club Band", year: 1967, genre: "Psychedelic Rock", tagline: "The studio-as-instrument turning point that redefined the physical album format forever." },
  { artist: "Led Zeppelin", title: "Led Zeppelin IV", year: 1971, genre: "Hard Rock", tagline: "John Bonham's massive Headley Grange drum acoustics on When the Levee Breaks." },
  { artist: "Led Zeppelin", title: "Physical Graffiti", year: 1975, genre: "Hard Rock", tagline: "A sprawling double album featuring die-cut tenement window sleeves and heavy analog riffs." },
  { artist: "The Rolling Stones", title: "Exile on Main St.", year: 1972, genre: "Blues Rock", tagline: "Recorded in the damp basement of Nellcôte; raw, murky, peerless double-LP rock & roll." },
  { artist: "David Bowie", title: "The Rise and Fall of Ziggy Stardust", year: 1972, genre: "Glam Rock", tagline: "The defining glam rock concept album, mastered with blistering Mick Ronson electric guitars." },
  { artist: "David Bowie", title: "Heroes", year: 1977, genre: "Art Rock / Berlin Trilogy", tagline: "Recorded at Hansa by the Wall in Berlin with Brian Eno's EMS synthesizer treatments." },
  { artist: "Fleetwood Mac", title: "Rumours", year: 1977, genre: "Pop Rock", tagline: "Emotional turmoil transformed into sonic perfection; the gold standard for warm analog mastering." },
  { artist: "The Who", title: "Who's Next", year: 1971, genre: "Hard Rock", tagline: "Pete Townshend's pulsing ARP synthesizer sequences opening Baba O'Riley and Won't Get Fooled Again." },
  { artist: "Black Sabbath", title: "Paranoid", year: 1970, genre: "Heavy Metal", tagline: "Tony Iommi's down-tuned riffs and Geezer Butler's thunderous bass forged heavy metal on vinyl." },
  { artist: "King Crimson", title: "In the Court of the Crimson King", year: 1969, genre: "Progressive Rock", tagline: "The birth of prog rock: 21st Century Schizoid Man and sweeping Mellotron landscapes." },
  { artist: "Steely Dan", title: "Aja", year: 1977, genre: "Yacht Rock / Jazz Rock", tagline: "The reference record audiophiles bring to stereo auditions; legendary Steve Gadd drum solos." },
  { artist: "The Doors", title: "The Doors", year: 1967, genre: "Psychedelic Rock", tagline: "Ray Manzarek's Vox Continental organ and Jim Morrison's dark poetry in raw Sunset Sound clarity." },
  { artist: "Jimi Hendrix Experience", title: "Electric Ladyland", year: 1968, genre: "Psychedelic Rock", tagline: "Double-album tour de force of phased stereo panning, reverse tape effects, and blistering blues." },
  { artist: "Neil Young", title: "Harvest", year: 1972, genre: "Folk Rock", tagline: "Warm acoustic guitars, pedal steel, and intimate Nashville barn recordings." },
  { artist: "Bob Dylan", title: "Blood on the Tracks", year: 1975, genre: "Folk Rock", tagline: "An open-tuned acoustic masterpiece of heartbreak, recorded with sparse, biting presence." },
  { artist: "Bruce Springsteen", title: "Born to Run", year: 1975, genre: "Heartland Rock", tagline: "Wall-of-sound production, glockenspiels, roaring saxophones, and panoramic American romance." },
  { artist: "Dire Straits", title: "Brothers in Arms", year: 1985, genre: "Roots Rock", tagline: "Pristine dynamic range and Mark Knopfler's expressive fingerpicked National steel guitar." },
  { artist: "The Velvet Underground & Nico", title: "The Velvet Underground & Nico", year: 1967, genre: "Art Rock / Proto-Punk", tagline: "The peelable banana Andy Warhol sleeve housing drone-violins, noise, and haunting street ballads." },
  { artist: "The Clash", title: "London Calling", year: 1979, genre: "Punk / Post-Punk", tagline: "A double-LP tour de force merging punk urgency with reggae, ska, rockabilly, and soul." },
  { artist: "Talking Heads", title: "Remain in Light", year: 1980, genre: "New Wave / Post-Punk", tagline: "Brian Eno production integrating Fela Kuti polyrhythms, funk basslines, and art-punk vocals." },

  // ELECTRONIC, TECHNO, AMBIENT & IDM
  { artist: "Kraftwerk", title: "Trans-Europe Express", year: 1977, genre: "Electronic / Krautrock", tagline: "The mechanical blueprint for techno, synth-pop, and early hip-hop rhythm tracks." },
  { artist: "Kraftwerk", title: "Computer World", year: 1981, genre: "Synth-Pop / Electro", tagline: "Prophetic vision of modern digital society scored on analog vocoders and pocket calculators." },
  { artist: "Daft Punk", title: "Discovery", year: 2001, genre: "French Touch / House", tagline: "Vintage anime nostalgia, filtered disco samples, and soaring analog vocoder hooks." },
  { artist: "Daft Punk", title: "Random Access Memories", year: 2013, genre: "Disco / Audiophile Funk", tagline: "Recorded in legendary studios with vintage analog consoles; reference-grade vinyl mastering." },
  { artist: "Aphex Twin", title: "Selected Ambient Works 85-92", year: 1992, genre: "Ambient Techno / IDM", tagline: "Dreamlike tape-recorded melodies and warm 808 percussion that founded modern IDM." },
  { artist: "Aphex Twin", title: "Selected Ambient Works Volume II", year: 1994, genre: "Dark Ambient", tagline: "Sprawling triple-LP of microtonal drone, isolationist atmosphere, and spectral acoustics." },
  { artist: "Boards of Canada", title: "Music Has the Right to Children", year: 1998, genre: "IDM / Downtempo", tagline: "Degraded analog tape warmth, vintage synth nostalgia, and haunting childhood memories." },
  { artist: "Boards of Canada", title: "Geogaddi", year: 2002, genre: "IDM / Hauntology", tagline: "Occult time-stretched sound collages, reverse beats, and warm Roland synthesizer pads." },
  { artist: "Massive Attack", title: "Mezzanine", year: 1998, genre: "Trip-Hop", tagline: "Heavy dub basslines, claustrophobic guitars, and Elizabeth Fraser's ethereal vocals on Teardrop." },
  { artist: "Portishead", title: "Dummy", year: 1994, genre: "Trip-Hop", tagline: "Original vinyl pressings sampled and scratched back onto tape for authentic vintage patina." },
  { artist: "Burial", title: "Untrue", year: 2007, genre: "Dubstep / Future Garage", tagline: "Vinyl crackle, pitching R&B vocal fragments, and rain-soaked South London nighttime bass." },
  { artist: "Brian Eno", title: "Ambient 1: Music for Airports", year: 1978, genre: "Ambient", tagline: "Tape loops of unequal lengths playing pianos and choir chords in perpetual gentle suspension." },
  { artist: "Tangerine Dream", title: "Phaedra", year: 1974, genre: "Berlin School", tagline: "Moog modular sequencer rhythms and Mellotron waves that defined space music." },
  { artist: "The Chemical Brothers", title: "Dig Your Own Hole", year: 1997, genre: "Big Beat", tagline: "Block Rockin' Beats delivered on loud, dynamic 2xLP club vinyl." },
  { artist: "The Prodigy", title: "The Fat of the Land", year: 1997, genre: "Big Beat / Electronic Rock", tagline: "Breathe and Firestarter compressed with massive kinetic punch for club turntable systems." },
  { artist: "Underworld", title: "Dubnobasswithmyheadman", year: 1994, genre: "Progressive House / Techno", tagline: "Seamless bridge between late-night acid house and moody post-punk lyricism." },
  { artist: "Jon Hopkins", title: "Immunity", year: 2013, genre: "Microhouse / Ambient Techno", tagline: "Organic foley recordings of pianos and room acoustics transformed into hypnotic club techno." },
  { artist: "Nicolas Jaar", title: "Space Is Only Noise", year: 2011, genre: "Microhouse / Downtempo", tagline: "Slow-tempo minimal grooves punctuated by dry clicks, deep sub-bass, and French dialogue." },
  { artist: "Four Tet", title: "Rounds", year: 2003, genre: "Folktronica", tagline: "Mandolins, glockenspiels, and vinyl flutter woven into complex, humanistic rhythmic collages." },
  { artist: "Bonobo", title: "Black Sands", year: 2010, genre: "Downtempo / Nu-Jazz", tagline: "Lush orchestral strings, live brass, and deep sub-bass; a staple of modern physical vinyl shelves." },
  { artist: "Gas", title: "Zauberberg", year: 1997, genre: "Ambient Techno", tagline: "Wolfgang Voigt's submerged 4/4 kicks beneath decaying brass samples of German Romanticism." },
  { artist: "Basic Channel", title: "BCD-2", year: 1995, genre: "Dub Techno", tagline: "The Berlin ground-zero of hiss, filter sweep, tape delay, and subterranean sub-bass pulses." },
  { artist: "Voices from the Lake", title: "Voices from the Lake", year: 2012, genre: "Hypnotic Techno", tagline: "Pristine dynamic range, deep sub-bass architecture, and hypnotic ambient-techno spatial design." },

  // SOUL, FUNK, R&B & REGGAE
  { artist: "Marvin Gaye", title: "What's Going On", year: 1971, genre: "Soul / R&B", tagline: "A socially conscious masterpiece flowing continuously across two sides with Motown's Funk Brothers." },
  { artist: "Stevie Wonder", title: "Songs in the Key of Life", year: 1976, genre: "Soul / Funk", tagline: "A magnificent double-LP plus bonus 7-inch EP capturing the pinnacle of 70s songwriting and Yamaha GX-1." },
  { artist: "Stevie Wonder", title: "Innervisions", year: 1973, genre: "Soul / Funk", tagline: "Stevie played virtually every instrument himself; biting social commentary and TONTO analog synths." },
  { artist: "Michael Jackson", title: "Thriller", year: 1982, genre: "Pop / R&B", tagline: "Quincy Jones' immaculate production and Bruce Swedien's Acusonic recording techniques." },
  { artist: "Prince", title: "Purple Rain", year: 1984, genre: "Pop Rock / Minneapolis Sound", tagline: "LinnDrum grooves, searing guitar solos, and emotional pop perfection on purple vinyl." },
  { artist: "Prince", title: "Sign o' the Times", year: 1987, genre: "Funk / R&B", tagline: "A double-album masterclass covering Fairlight sampling, dirty funk, rock, and heartfelt ballads." },
  { artist: "Curtis Mayfield", title: "Superfly", year: 1972, genre: "Funk / Blaxploitation", tagline: "Lush orchestral strings and wah-wah guitar providing raw commentary on urban survival." },
  { artist: "Al Green", title: "I'm Still in Love with You", year: 1972, genre: "Memphis Soul", tagline: "Willie Mitchell's warm Hi Records studio sound, crisp snare snaps, and effortless falsetto." },
  { artist: "Aretha Franklin", title: "I Never Loved a Man the Way I Love You", year: 1967, genre: "Southern Soul", tagline: "Recorded with the Muscle Shoals rhythm section; Respect and pure gospel-infused soul." },
  { artist: "D'Angelo", title: "Voodoo", year: 2000, genre: "Neo-Soul", tagline: "Recorded at Electric Lady on 2-inch tape; Questlove's unquantized laid-back drum groove benchmark." },
  { artist: "Erykah Badu", title: "Baduizm", year: 1997, genre: "Neo-Soul", tagline: "Upright basslines, smoky Rhodes keys, and Billie Holiday-inspired vocal phrasing." },
  { artist: "Lauryn Hill", title: "The Miseducation of Lauryn Hill", year: 1998, genre: "R&B / Hip-Hop", tagline: "Soul, reggae, and boom-bap unified into one of the most celebrated analog debuts in modern music." },
  { artist: "Sade", title: "Diamond Life", year: 1984, genre: "Sophisti-Pop / Smooth Soul", tagline: "Smooth saxophone, warm upright bass, and Sade Adu's sultry, understated vocal presence." },
  { artist: "Amy Winehouse", title: "Back to Black", year: 2006, genre: "Soul / R&B", tagline: "Dap-Kings horn arrangements producing authentic 60s Wall-of-Sound analog warmth." },
  { artist: "Bob Marley & The Wailers", title: "Catch a Fire", year: 1973, genre: "Roots Reggae", tagline: "Original Zippo-lighter flip sleeve; Island Records' hi-fi crossover presentation of roots reggae." },
  { artist: "Bob Marley & The Wailers", title: "Exodus", year: 1977, genre: "Roots Reggae", tagline: "Recorded in London exile; deep warm Jamaican basslines and enduring universal anthems." },

  // HIP-HOP MASTERWORKS
  { artist: "Nas", title: "Illmatic", year: 1994, genre: "East Coast Hip-Hop", tagline: "Q-Tip, DJ Premier, Large Professor, and Pete Rock providing the definitive boom-bap sonic palette." },
  { artist: "A Tribe Called Quest", title: "The Low End Theory", year: 1991, genre: "Jazz Rap", tagline: "Ron Carter playing live acoustic bass alongside crisp SP-1200 jazz vinyl chops." },
  { artist: "A Tribe Called Quest", title: "Midnight Marauders", year: 1993, genre: "Jazz Rap", tagline: "Pristine audio fidelity and seamless sample integration across two timeless sides." },
  { artist: "Wu-Tang Clan", title: "Enter the Wu-Tang (36 Chambers)", year: 1993, genre: "Hardcore Hip-Hop", tagline: "RZA's dusty Ensoniq EPS samples, kung-fu dialogue, and raw Staten Island basement grit." },
  { artist: "The Notorious B.I.G.", title: "Ready to Die", year: 1994, genre: "East Coast Hip-Hop", tagline: "Cinematic storytelling over warm funk breaks; the golden era of Bad Boy analog engineering." },
  { artist: "Dr. Dre", title: "The Chronic", year: 1992, genre: "G-Funk", tagline: "Whining Minimoog synthesizers, live Parliament-style basslines, and crisp analog mastering." },
  { artist: "Outkast", title: "Aquemini", year: 1998, genre: "Southern Hip-Hop", tagline: "Live instrumentation, harmonicas, funk guitars, and cosmic philosophical lyricism on double vinyl." },
  { artist: "Kendrick Lamar", title: "To Pimp a Butterfly", year: 2015, genre: "Conscious Hip-Hop / Jazz Rap", tagline: "Thundercat, Kamasi Washington, and Robert Glasper anchoring a 21st-century vinyl landmark." },
  { artist: "Kendrick Lamar", title: "good kid, m.A.A.d city", year: 2012, genre: "West Coast Hip-Hop", tagline: "A non-linear audio documentary of Compton; deep trunk-rattling sub-bass and crisp vocals." },
  { artist: "Madvillain", title: "Madvillainy", year: 2004, genre: "Abstract Hip-Hop", tagline: "Madlib's dusty turntable crate-digging collages beneath MF DOOM's labyrinthine rhyme schemes." },
  { artist: "J Dilla", title: "Donuts", year: 2006, genre: "Instrumental Hip-Hop", tagline: "Completed in hospital with an SP-303; micro-chopped soul vinyl loops transformed into emotional art." },
  { artist: "Mos Def", title: "Black on Both Sides", year: 1999, genre: "Conscious Hip-Hop", tagline: "Brooklyn hip-hop meets live guitars and upright bass; Ms. Fat Booty remains an essential 12-inch cut." },

  // ALTERNATIVE, INDIE, POST-PUNK & GRUNGE
  { artist: "Nirvana", title: "Nevermind", year: 1991, genre: "Grunge / Alternative", tagline: "Butch Vig's explosive dynamics on 180g vinyl: quiet verses crashing into colossal chorus guitars." },
  { artist: "Radiohead", title: "OK Computer", year: 1997, genre: "Art Rock", tagline: "Nigel Godrich's cavernous St. Catherine's Court reverb, glockenspiels, and dystopian Mellotrons." },
  { artist: "Radiohead", title: "Kid A", year: 2000, genre: "Experimental Electronic / Art Rock", tagline: "Ondes Martenot, Modular Moogs, and free-jazz horns on 10-inch double vinyl." },
  { artist: "Radiohead", title: "In Rainbows", year: 2007, genre: "Art Rock", tagline: "Warm, dry, immediate room acoustics; widely considered one of the finest vinyl pressings of the 2000s." },
  { artist: "Joy Division", title: "Unknown Pleasures", year: 1979, genre: "Post-Punk", tagline: "Peter Saville's pulsar radio sleeve enclosing Martin Hannett's radical spatial echo and glass breaking." },
  { artist: "The Cure", title: "Disintegration", year: 1989, genre: "Gothic Rock / Post-Punk", tagline: "Huge, swirling flanged guitars, deep basslines, and Robert Smith's expansive melancholic reverb." },
  { artist: "The Smiths", title: "The Queen Is Dead", year: 1986, genre: "Jangle Pop / Indie Rock", tagline: "Johnny Marr's layered Rickenbacker guitars and Morrissey's razor-sharp theatrical prose." },
  { artist: "Depeche Mode", title: "Violator", year: 1990, genre: "Synth-Pop", tagline: "Flood and Alan Wilder's masterclass in combining blues guitars with menacing analog sequencers." },
  { artist: "Pixies", title: "Doolittle", year: 1989, genre: "Indie Rock", tagline: "Loud-quiet-loud dynamic architecture, surrealist lyrics, and searing Black Francis vocals." },
  { artist: "My Bloody Valentine", title: "Loveless", year: 1991, genre: "Shoegaze", tagline: "Kevin Shields' reverse reverb 'glide guitar' creating an impenetrable, intoxicating wall of sound." },
  { artist: "Slowdive", title: "Souvlaki", year: 1993, genre: "Shoegaze / Dream Pop", tagline: "Brian Eno collaborations and oceanic modulated guitar delays pressed on deep vinyl." },
  { artist: "Cocteau Twins", title: "Heaven or Las Vegas", year: 1990, genre: "Dream Pop", tagline: "Robin Guthrie's shimmering chorus guitars and Elizabeth Fraser's glossolalic vocals." },
  { artist: "The Strokes", title: "Is This It", year: 2001, genre: "Garage Rock Revival", tagline: "Gordon Raphael's blown-out preamp distortions and driving straight-eight hi-hat energy." },
  { artist: "The White Stripes", title: "Elephant", year: 2003, genre: "Garage Rock", tagline: "Recorded completely analog at Toe Rag Studios using no gear newer than 1963; Seven Nation Army." },
  { artist: "Arcade Fire", title: "Funeral", year: 2004, genre: "Indie Rock", tagline: "Chamber violins, roaring accordions, and passionate choral anthems on heavyweight gatefold vinyl." },
  { artist: "Tame Impala", title: "Currents", year: 2015, genre: "Psychedelic Pop / Synth-Pop", tagline: "Kevin Parker's lush Roland Juno synthesizer sweeps, flanged bass, and punchy disco drums." },
  { artist: "Bon Iver", title: "For Emma, Forever Ago", year: 2007, genre: "Indie Folk", tagline: "Recorded in a Wisconsin winter cabin with multi-tracked falsetto and resonant acoustic guitars." },
  { artist: "Fleet Foxes", title: "Fleet Foxes", year: 2008, genre: "Indie Folk", tagline: "Sacred-sounding four-part vocal harmonies and vintage plate reverb recorded in Seattle." },

  // WORLD, BOSSA NOVA, KRAUTROCK & GLOBAL EXPERIMENTAL
  { artist: "Fela Kuti & Africa 70", title: "Zombie", year: 1976, genre: "Afrobeat", tagline: "Tony Allen's peerless polyrhythms and blistering horn arrangements protesting state violence." },
  { artist: "Buena Vista Social Club", title: "Buena Vista Social Club", year: 1997, genre: "Son Cubano / Bolero", tagline: "Ry Cooder's warm Havana studio recordings with Cuba's legendary golden-age masters." },
  { artist: "Can", title: "Tago Mago", year: 1971, genre: "Krautrock", tagline: "Jaki Liebezeit's metronomic 'motorik' drumming and Damo Suzuki's fevered, hypnotic chants." },
  { artist: "Can", title: "Future Days", year: 1973, genre: "Krautrock / Ambient", tagline: "Shimmering, buoyant electronic percussion and ambient sound design recorded in an inner space cinema." },
  { artist: "Neu!", title: "Neu!", year: 1972, genre: "Krautrock", tagline: "Klaus Dinger's continuous Klaus beat and Michael Rother's soaring guitar lines; influenced Bowie and Eno." },
  { artist: "Haruomi Hosono", title: "Hosono House", year: 1973, genre: "Japanese Folk / City Pop", tagline: "Recorded at Hosono's Sayama home with 16-track analog equipment; intimate, warm master." },
  { artist: "Ryuichi Sakamoto", title: "Thousand Knives", year: 1978, genre: "Electronic / Japanese Synth", tagline: "Moog IIIc modular sequences and Casio VL-Tone experiments by Yellow Magic Orchestra's maestro." },
  { artist: "Tatsuro Yamashita", title: "For You", year: 1982, genre: "City Pop / Funk", tagline: "The holy grail of Japanese City Pop: sparkling slap bass, brass flourishes, and ocean breeze mixing." },
  { artist: "Jorge Ben", title: "A Tábua de Esmeralda", year: 1974, genre: "Samba Soul / MPB", tagline: "Alchemical acoustic guitar rhythms, strings, and spiritual Brazilian samba groove." },
  { artist: "Khruangbin", title: "Con Todo El Mundo", year: 2018, genre: "Thai Funk / Psych Dub", tagline: "Recorded in a remote Texas barn; Laura Lee's deep bass and Mark Speer's reverbed Stratocaster." }
];

console.log(`Loaded ${MASTER_PICKS.length} baseline holy grails.`);

// Load existing catalog to mine remaining records to reach exactly 365
let catalogRecords = [];
try {
  if (fs.existsSync(CATALOG_FILE)) {
    const rawCat = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    catalogRecords = Array.isArray(rawCat) ? rawCat : Object.values(rawCat);
  }
} catch (e) {
  console.warn("Could not read catalog.json:", e.message);
}

// Map of normalized artist + title to prevent duplicates
const seen = new Set();
const vault365 = [];

function getSlug(artist, title) {
  return `${artist || ''} - ${title || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// 1. Add Master Picks first
for (const pick of MASTER_PICKS) {
  const slug = getSlug(pick.artist, pick.title);
  if (!seen.has(slug)) {
    seen.add(slug);
    vault365.push({
      day: vault365.length + 1,
      artist: pick.artist.trim(),
      title: pick.title.trim(),
      year: pick.year || 1975,
      genre: pick.genre || "Essential Vinyl",
      tagline: pick.tagline || "Landmark analog vinyl pressing celebrated by audiophile collectors worldwide.",
      query: `${pick.artist} - ${pick.title}`
    });
  }
}

// 2. Select curated gems from catalogRecords until we reach exactly 365
for (const cat of catalogRecords) {
  if (vault365.length >= 365) break;
  if (!cat || !cat.title || !cat.artist) continue;

  const slug = getSlug(cat.artist, cat.title);
  if (!seen.has(slug)) {
    seen.add(slug);
    vault365.push({
      day: vault365.length + 1,
      artist: cat.artist.trim(),
      title: cat.title.trim(),
      year: parseInt(cat.year, 10) || 1980,
      genre: cat.genre ? cat.genre.trim() : "Essential Vinyl",
      tagline: `Essential ${cat.genre || 'analog'} album featuring renowned dynamic range and vinyl staging.`,
      query: `${cat.artist} - ${cat.title}`
    });
  }
}

// 3. If still short of 365, supplement with additional world-renowned classics
const ADDITIONAL_LEGENDS = [
  { artist: "Television", title: "Marquee Moon", year: 1977, genre: "Post-Punk / Art Rock", tagline: "Interlocking clean Fender guitars and Tom Verlaine's soaring poetic solos." },
  { artist: "Patti Smith", title: "Horses", year: 1975, genre: "Proto-Punk", tagline: "Robert Mapplethorpe cover; raw downtown poetry merging with garage rock fury." },
  { artist: "Iggy Pop", title: "Lust for Life", year: 1977, genre: "Hard Rock", tagline: "Recorded at Hansa Studios Berlin with David Bowie; Hunt Sales' iconic drum shuffle." },
  { artist: "Roxy Music", title: "Avalon", year: 1982, genre: "Sophisti-Pop / Art Rock", tagline: "Bob Clearmountain's reference-standard audiophile mix with peerless silky atmosphere." },
  { artist: "Lou Reed", title: "Transformer", year: 1972, genre: "Glam Rock", tagline: "Walk on the Wild Side; Herbie Flowers' double-tracked acoustic and fretless basslines." },
  { artist: "The Cure", title: "Pornography", year: 1982, genre: "Gothic Rock", tagline: "Heavy tribal drumming, flanged bass, and visceral post-punk intensity." },
  { artist: "The Jesus and Mary Chain", title: "Psychocandy", year: 1985, genre: "Noise Pop / Shoegaze", tagline: "Beach Boys melodies drowned in shrieking feedback and reverb." },
  { artist: "Spiritualized", title: "Ladies and Gentlemen We Are Floating in Space", year: 1997, genre: "Space Rock / Neo-Psychedelia", tagline: "Orchestras, gospel choirs, and massive space-rock crescendos on double vinyl." },
  { artist: "Primal Scream", title: "Screamadelica", year: 1991, genre: "Acid House / Psychedelic Rock", tagline: "Andrew Weatherall production fusing rock songcraft with euphoric UK rave culture." },
  { artist: "Talk Talk", title: "Spirit of Eden", year: 1988, genre: "Post-Rock", tagline: "The dawn of post-rock; recorded in total darkness using spontaneous improvisations on tape." },
  { artist: "Talk Talk", title: "Laughing Stock", year: 1991, genre: "Post-Rock", tagline: "Sparse, breathtaking acoustic dynamics with silence treated as an active instrument." },
  { artist: "Slint", title: "Spiderland", year: 1991, genre: "Post-Rock / Math Rock", tagline: "Recorded by Brian Paulson; chilling whispered narratives exploding into jagged distortion." },
  { artist: "Tortoise", title: "Millions Now Living Will Never Die", year: 1996, genre: "Post-Rock", tagline: "Dueling vibraphones, twin bass guitars, and Krautrock-infused rhythmic discipline." },
  { artist: "Stereolab", title: "Dots and Loops", year: 1997, genre: "Post-Rock / Lounge Pop", tagline: "Moogs, bossa nova rhythms, and vintage analog gear recorded with John McEntire." },
  { artist: "Air", title: "Moon Safari", year: 1998, genre: "Downtempo / French Touch", tagline: "Moog bass, vocoder hooks, and cinematic 60s lounge strings on pristine vinyl." },
  { artist: "Zero 7", title: "Simple Things", year: 2001, genre: "Downtempo / Acid Jazz", tagline: "Sia's breakthrough vocals alongside warm Rhodes piano, acoustic guitars, and soft brass." },
  { artist: "Thievery Corporation", title: "The Richest Man in Babylon", year: 2002, genre: "Downtempo / Dub", tagline: "Bossa nova, sitars, dub echoes, and Middle Eastern instrumentation on double LP." },
  { artist: "Kruder & Dorfmeister", title: "The K&D Sessions", year: 1998, genre: "Dub / Downtempo", tagline: "The gold standard of late-90s Vienna downtempo; massive, warm, dub-infused 4xLP vinyl box." },
  { artist: "DJ Shadow", title: "Endtroducing.....", year: 1996, genre: "Instrumental Hip-Hop", tagline: "The first album created entirely from vinyl samples on an Akai MPC60." },
  { artist: "The Avalanches", title: "Since I Left You", year: 2000, genre: "Plunderphonics", tagline: "Constructed from over 3,500 vinyl records; a sun-drenched cruise through forgotten music history." },
  { artist: "Gramatik", title: "Street Bangerz Vol. 1", year: 2008, genre: "Boom Bap / Chillhop", tagline: "Vintage soul chops, heavy vinyl crackle, and neck-snapping boom-bap kicks." },
  { artist: "Nujabes", title: "Modal Soul", year: 2005, genre: "Lo-Fi Hip-Hop / Jazz Rap", tagline: "The spiritual blueprint for lo-fi hip-hop; heartfelt piano loops and delicate vinyl flutter." },
  { artist: "MF DOOM", title: "Operation: Doomsday", year: 1999, genre: "Underground Hip-Hop", tagline: "Raw 80s pop and cartoon samples supporting the birth of the metal-faced villain." },
  { artist: "Quasimoto", title: "The Unseen", year: 2000, genre: "Abstract Hip-Hop", tagline: "Madlib pitching his own vocals up on tape over dusty jazz obscurities." },
  { artist: "Cypress Hill", title: "Black Sunday", year: 1993, genre: "West Coast Hip-Hop", tagline: "DJ Muggs' dusty, dark, heavy bass breaks and eerie sirens pressed on loud vinyl." },
  { artist: "Wu-Tang Clan", title: "Wu-Tang Forever", year: 1997, genre: "East Coast Hip-Hop", tagline: "A colossal 4-LP masterwork of baroque strings and raw Staten Island kung-fu lyricism." },
  { artist: "GZA", title: "Liquid Swords", year: 1995, genre: "Hardcore Hip-Hop", tagline: "Shogun Assassin dialogue, cold synthesizers, and peerless technical rhyme schemes." },
  { artist: "Raekwon", title: "Only Built 4 Cuban Linx...", year: 1995, genre: "Mafioso Rap", tagline: "Known as the Purple Tape; cinematic RZA sampling and classic Ghostface Killah chemistry." },
  { artist: "Mobb Deep", title: "The Infamous", year: 1995, genre: "Hardcore Hip-Hop", tagline: "Havoc's bone-chilling piano loops and Prodigy's stark Queensbridge reality on Shook Ones Pt. II." },
  { artist: "Big L", title: "Lifestylez ov da Poor & Dangerous", year: 1995, genre: "East Coast Hip-Hop", tagline: "Flawless punchline delivery over classic Lord Finesse and Showbiz boom-bap productions." },
  { artist: "Common", title: "Like Water for Chocolate", year: 2000, genre: "Neo-Soul / Hip-Hop", tagline: "Soulquarians production with J Dilla, Pino Palladino bass, and Roy Hargrove horns." },
  { artist: "The Roots", title: "Things Fall Apart", year: 1999, genre: "Live Hip-Hop", tagline: "Live instruments recorded with crisp studio presence; You Got Me won a Grammy." },
  { artist: "Black Star", title: "Mos Def & Talib Kweli Are Black Star", year: 1998, genre: "Conscious Hip-Hop", tagline: "Thoughtful Brooklyn conscious lyricism and raw DJ Hi-Tek boom-bap grooves." },
  { artist: "Eminem", title: "The Marshall Mathers LP", year: 2000, genre: "Hip-Hop", tagline: "Dr. Dre's crisp engineering, dark pianos, and unprecedented lyrical velocity." },
  { artist: "Kanye West", title: "The College Dropout", year: 2004, genre: "Chipmunk Soul", tagline: "High-pitched sped-up soul samples and live strings that altered modern rap production." },
  { artist: "Kanye West", title: "My Beautiful Dark Twisted Fantasy", year: 2010, genre: "Progressive Rap", tagline: "Maximalist triple-LP gatefold with interchangeable George Condo artwork inserts." },
  { artist: "Gorillaz", title: "Demon Days", year: 2005, genre: "Trip-Hop / Alternative", tagline: "Danger Mouse production; Feel Good Inc. and Dare deliver massive dynamic bass on vinyl." },
  { artist: "Beck", title: "Sea Change", year: 2002, genre: "Chamber Folk", tagline: "The Mobile Fidelity Sound Lab reference pressing; immense string arrangements by David Campbell." },
  { artist: "Sufjan Stevens", title: "Illinois", year: 2005, genre: "Chamber Pop", tagline: "Elaborate orchestration, horns, glockenspiels, and epic narrative folk songwriting." },
  { artist: "The National", title: "High Violet", year: 2010, genre: "Indie Rock", tagline: "Bryan Devendorf's intricate drumming, gloomy baritone vocals, and layered brass swells." },
  { artist: "Sigur Rós", title: "Ágætis byrjun", year: 1999, genre: "Post-Rock", tagline: "Jónsi's bowed guitar and soaring Icelandic falsetto evoking glacial grandeur." },
  { artist: "Godspeed You! Black Emperor", title: "F# A# ∞", year: 1997, genre: "Post-Rock", tagline: "Field recordings, mournful horns, and apocalyptic crescendos ending in a locked groove." }
];

for (const extra of ADDITIONAL_LEGENDS) {
  if (vault365.length >= 365) break;
  const slug = getSlug(extra.artist, extra.title);
  if (!seen.has(slug)) {
    seen.add(slug);
    vault365.push({
      day: vault365.length + 1,
      artist: extra.artist.trim(),
      title: extra.title.trim(),
      year: extra.year,
      genre: extra.genre,
      tagline: extra.tagline,
      query: `${extra.artist} - ${extra.title}`
    });
  }
}

// Ensure exactly 365 entries
while (vault365.length < 365) {
  const i = vault365.length;
  vault365.push({
    day: i + 1,
    artist: "Various Artists",
    title: `Audiophile Classic Vol. ${i}`,
    year: 1975,
    genre: "Audiophile Classic",
    tagline: "Essential master cut celebrated for its open acoustic staging.",
    query: `Audiophile Classic ${i}`
  });
}

// Slice to exactly 365
const finalVault = vault365.slice(0, 365).map((rec, idx) => ({
  ...rec,
  day: idx + 1
}));


// Ensure Day 285 is Miles Davis - Kind of Blue for today
const todayPick = finalVault.find(v => v.artist === "Miles Davis" && v.title === "Kind of Blue");
if (todayPick) {
  const cur285 = finalVault[284];
  const oldIdx = finalVault.indexOf(todayPick);
  finalVault[284] = todayPick;
  finalVault[oldIdx] = cur285;
  finalVault.forEach((v, i) => v.day = i + 1);
}

fs.writeFileSync(VAULT_FILE, JSON.stringify(finalVault, null, 2), 'utf8');
console.log(`Successfully generated 365 Vault at ${VAULT_FILE} with exactly ${finalVault.length} albums!`);
