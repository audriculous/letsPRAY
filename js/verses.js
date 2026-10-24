// Short NIV verses on prayer, one per day.
export const VERSES = [
  { ref: 'Philippians 4:6', text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.' },
  { ref: '1 Thessalonians 5:16–18', text: 'Rejoice always, pray continually, give thanks in all circumstances; for this is God’s will for you in Christ Jesus.' },
  { ref: 'Colossians 4:2', text: 'Devote yourselves to prayer, being watchful and thankful.' },
  { ref: 'Romans 12:12', text: 'Be joyful in hope, patient in affliction, faithful in prayer.' },
  { ref: '1 Peter 5:7', text: 'Cast all your anxiety on him because he cares for you.' },
  { ref: 'Matthew 7:7', text: 'Ask and it will be given to you; seek and you will find; knock and the door will be opened to you.' },
  { ref: 'Hebrews 4:16', text: 'Let us then approach God’s throne of grace with confidence, so that we may receive mercy and find grace to help us in our time of need.' },
  { ref: 'Psalm 145:18', text: 'The LORD is near to all who call on him, to all who call on him in truth.' },
  { ref: '1 John 5:14', text: 'This is the confidence we have in approaching God: that if we ask anything according to his will, he hears us.' },
  { ref: 'Jeremiah 33:3', text: 'Call to me and I will answer you and tell you great and unsearchable things you do not know.' },
  { ref: 'James 5:16', text: 'The prayer of a righteous person is powerful and effective.' },
  { ref: 'Ephesians 6:18', text: 'And pray in the Spirit on all occasions with all kinds of prayers and requests.' },
];

export function verseFor(offset = 0, ts = Date.now()) {
  const day = Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / 86400000);
  return VERSES[(day + offset) % VERSES.length];
}
