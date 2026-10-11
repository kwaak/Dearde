// The world of Samen: zones with their own look, each a chain of areas.
// Every area is checked by the solver tests: solvable, impossible for either
// player alone, and roughly harder than the one before.
(function (root) {
  'use strict';

  const ZONES = [
    { id: 'tuin', name: 'De Tuin' },
    { id: 'ijs', name: 'De IJsvlakte' },
    { id: 'grot', name: 'De Grot' },
    { id: 'meer', name: 'Het Meer' },
    { id: 'paddo', name: 'Het Paddenstoelenrijk' },
    { id: 'kasteel', name: 'Het Kasteel' },
    { id: 'hart', name: 'Het Hart' },
  ];

  const AREAS = [
    {
      zone: 'tuin',
      title: 'Hallo samen',
      tips: [
        'Stap op de blauwe knop. Dan gaat de blauwe deur open voor Maxi.',
        'Wacht tot Mini op de blauwe knop staat en loop dan naar een hartje.',
      ],
      map: [
        '#########',
        '#m..#.M.#',
        '#.b.#...#',
        '#...#B###',
        '##.....E#',
        '##E.....#',
        '#########',
      ],
    },
    {
      zone: 'ijs',
      title: 'Glijbaan',
      tips: [
        'Stap op de blauwe knop zodat Maxi eruit kan. Op ijs glij je door tot je ergens tegenaan botst, ook tegen je maatje!',
        'Op het ijs stop je pas als je ergens tegenaan botst. Ga zo staan dat Mini precies onder een hartje stopt, en wissel dan van rol.',
      ],
      map: [
        '###########',
        '####EE#####',
        '#_________#',
        '#.####.####',
        '#......BM.#',
        '#####.#####',
        '#m..b.....#',
        '###########',
      ],
    },
    {
      zone: 'ijs',
      title: 'Glijdende kist',
      tips: [
        'Ga op het ijs staan, net voorbij de plek boven de roze knop. Dan stopt de kist precies goed.',
        'Duw de kist het ijs op. Als Mini hem tegenhoudt, duw je hem van bovenaf op de roze knop.',
      ],
      map: [
        '############',
        '#m.........#',
        '#M$_______.#',
        '######a##A##',
        '#..........#',
        '#.$_______.#',
        '####b####B##',
        '########E.E#',
        '############',
      ],
    },
    {
      zone: 'grot',
      title: 'Muizengat',
      tips: [
        'Kruip door het muizengat en stap op de blauwe knop voor Maxi.',
        'Duw de kist op de roze knop. Dan blijft de roze deur open.',
      ],
      map: [
        '############',
        '#m.o..b#M..#',
        '#..#...B.$.#',
        '####...#.a.#',
        '#E..A..#...#',
        '#E..########',
        '############',
      ],
    },
    {
      zone: 'grot',
      title: 'Krakende vloer',
      tips: [
        'Alleen jij bent licht genoeg voor de krakende vloer. De roze knop ligt aan de overkant.',
        'Duw eerst de kist op de blauwe knop. Daarna laat Mini je eruit.',
      ],
      map: [
        '############',
        '#m..xxxx..a#',
        '#...#####..#',
        '#...A.$.b.##',
        '#...#.M...##',
        '##B#########',
        '#E.E########',
        '############',
      ],
    },
    {
      zone: 'meer',
      title: 'Eilandjes',
      tips: [
        'Ga op de roze knop staan, dan kan Maxi een kist naar jouw kant duwen.',
        'Duw een kist door de roze deur en dan het water in. Over die brug komen jullie bij de hartjes.',
      ],
      map: [
        '############',
        '#M..$..#...#',
        '#..$...A.m.#',
        '#......#.a.#',
        '#######~~~##',
        '##~~.EE...##',
        '############',
      ],
    },
    {
      zone: 'meer',
      title: 'Bruggetje',
      tips: [
        'Kruip door het muizengat naar de roze knop, zodat Maxi eruit kan.',
        'Duw twee kisten in dezelfde rij het water in. Zo maak je een brug.',
      ],
      map: [
        '############',
        '#a.o....~~E#',
        '###..$..~~.#',
        '###..$..~~.#',
        '#M.A....~~E#',
        '#..#m...~~.#',
        '############',
      ],
    },
    {
      zone: 'paddo',
      title: 'Warpbuis',
      tips: [
        'Stap in de groene buis: je komt eruit bij de andere buis. Ga daar op de blauwe knop staan.',
        'Loop door de blauwe deur en ga op de roze knop staan. Dan kan Mini door de buis terug en via haar deur naar beneden.',
      ],
      map: [
        '#############',
        '#m...#..1...#',
        '#.1..#M...b.#',
        '##A#####B####',
        '#...........#',
        '#E...a.....E#',
        '#############',
      ],
    },
    {
      zone: 'paddo',
      title: 'Steenblokken',
      tips: [
        'Kruip door het muizengat en ga op de blauwe knop staan. Maxi slaat de stenen blokken voor je kapot.',
        'Jij bent sterk: loop tegen een steenblok aan en hij breekt. Maak een gat naar Mini en naar de hartjes.',
      ],
      map: [
        '#############',
        '#b.o..m#..M.#',
        '####...#....#',
        '#EE#rrr###B##',
        '#..r........#',
        '#############',
      ],
    },
    {
      zone: 'paddo',
      title: 'Springveer',
      tips: [
        'Stap op de veer en je springt over het water! Op het eilandje is de roze knop, en een veer terug.',
        'Wacht tot Mini op de roze knop staat. Sla dan het steenblok kapot zodat Mini erbij kan.',
      ],
      map: [
        '############',
        '#m.j~.a#.M.#',
        '#...~j.#...#',
        '##r#####A###',
        '#E.........#',
        '#E.........#',
        '############',
      ],
    },
    {
      zone: 'paddo',
      title: 'Muntjes',
      tips: [
        'Pak de muntjes achter de krakende vloer. Zijn alle muntjes op, dan gaat de sterdeur open.',
        'Sla de stenen blokken kapot en pak de muntjes daarachter. Alle muntjes op = sterdeur open!',
      ],
      map: [
        '##############',
        '#*x...m.M.r.*#',
        '#*x.......r.*#',
        '######S#######',
        '#####E.E######',
        '##############',
      ],
    },
    {
      zone: 'paddo',
      title: 'P-knop',
      tips: [
        'De P-knop maakt even een brug van blokjes. Druk erop, dan rent Maxi eroverheen. Je hebt maar 8 stapjes!',
        'Ren over de brug zodra Mini op de P-knop drukt. Aan de overkant is ook een P-knop: druk erop als Mini klaarstaat.',
      ],
      map: [
        '################',
        '#p.......#....p#',
        '#m......Mqqqq.E#',
        '#.......#....E.#',
        '################',
      ],
    },
    {
      zone: 'paddo',
      title: 'Paddenstoelpaleis',
      tips: [
        'Pak je muntje door het muizengat en blijf op de blauwe knop tot Maxi eruit is. Het derde muntje ligt op het eilandje: neem de veer!',
        'Sla het muntje uit de stenen blokken en duw de kist op de roze knop voor Mini. Achter de sterdeur wacht de P-knop.',
      ],
      map: [
        '##############',
        '#*o.m.#.M..r*#',
        '###...#.....r#',
        '###.b.#......#',
        '#####A##B#####',
        '#.j~..$.....a#',
        '#*~j.........#',
        '#######S######',
        '#p.......qq.E#',
        '#........qqpE#',
        '##############',
      ],
    },
    {
      zone: 'kasteel',
      title: 'Hendels',
      tips: [
        'De hendel zet het hek open, en de volgende keer weer dicht. Haal daarna de sleutel voor het slot naar de hartjes.',
        'Duw de kist op de roze knop. Glip door het hek zodra Mini voorbij de hendel is.',
      ],
      map: [
        '#############',
        '#m..o.u.A.k.#',
        '#...#########',
        '#...U.$...a.#',
        '#...#.M.....#',
        '##K##########',
        '#E.E#########',
        '#############',
      ],
    },
    {
      zone: 'kasteel',
      title: 'Kasteelpoort',
      tips: [
        'Haal de sleutel over de krakende vloer en open het slot naar Maxi.',
        'Zet de hendel om voor het hek. Eén kist wordt een brug in het water, de andere moet op de roze knop.',
      ],
      map: [
        '##############',
        '#m..xxx.k#####',
        '#...##########',
        '#...U.$..~.a.#',
        '##K###...~..A#',
        '#.$u..######.#',
        '#.M..#####EE.#',
        '##############',
      ],
    },
    {
      zone: 'hart',
      title: 'Het hart',
      tips: [
        'Kruip naar de roze knop tot Maxi de kisten heeft. In de kasteelzaal haal jij de sleutel over de krakende vloer.',
        'Laat twee kisten over het ijs het water in glijden, en duw in de kasteelzaal de kist op de roze knop zodat Mini bij de sleutel kan.',
      ],
      map: [
        '###############',
        '#m.o.a#M......#',
        '#..#####$.$...#',
        '#.......A######',
        '#__________~~.#',
        '#############.#',
        '#kxxxA....a.$.#',
        '######........#',
        '#########K#####',
        '########E.E####',
        '###############',
      ],
    },
  ];

  const api = { ZONES, AREAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SamenWorld = api;
})(this);
