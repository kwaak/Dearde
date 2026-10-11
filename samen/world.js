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
      zone: 'tuin',
      title: 'Help elkaar',
      tips: [
        'Stap op de blauwe knop. Dan gaat de blauwe deur open voor Maxi.',
        'Loop door de blauwe deur en stap op de roze knop. Dan kan Mini eruit.',
      ],
      map: [
        '#########',
        '#m..#..M#',
        '#.b.#...#',
        '##A###B##',
        '#..a....#',
        '#E.....E#',
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
      title: 'Vertrouwen',
      tips: [
        'Kruip door het muizengat en blijf op de blauwe knop staan.',
        'Duw de kist door de blauwe deur en op de roze knop.',
      ],
      map: [
        '############',
        '#M...#.....#',
        '#..$.B.....#',
        '#....#..a..#',
        '######.....#',
        '#m..o..b...#',
        '#...#####A##',
        '######E...E#',
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
      zone: 'kasteel',
      title: 'De sleutel',
      tips: [
        'Haal de sleutel over de krakende vloer en open daarmee het slot voor Maxi.',
        'Duw de kist op de blauwe knop. Dan gaat de weg naar de hartjes open.',
      ],
      map: [
        '############',
        '#m..xxxx.k.#',
        '#...########',
        '#...K..$.b.#',
        '#...#.M....#',
        '##B#########',
        '#E.E########',
        '############',
      ],
    },
    {
      zone: 'kasteel',
      title: 'Hendels',
      tips: [
        'De hendel zet het hek open, en bij de volgende keer weer dicht. Je loopt er heen én terug overheen!',
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
      title: 'Alles samen',
      tips: [
        'Kruip naar de roze knop en blijf staan tot Maxi allebei de kisten naar buiten heeft.',
        'Laat de kisten over het ijs het water in glijden. Twee kisten maken een brug naar de hartjes.',
      ],
      map: [
        '###############',
        '#m.o.a#M......#',
        '#..#####$.$...#',
        '#.......A######',
        '#__________~~E#',
        '#############E#',
        '###############',
      ],
    },
    {
      zone: 'hart',
      title: 'Het hart',
      tips: [
        'Eerst de kistenbrug, net als daarnet. In de kasteelzaal haal jij de sleutel over de krakende vloer.',
        'Bouw de brug, en duw in de kasteelzaal de kist op de roze knop zodat Mini bij de sleutel kan.',
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
