import { expect, it } from 'vitest';
import { availableTimeLabel, mentorTechnologies, searchMentors, upcomingTime, type MentorListing, type MentorSearchFilters } from './mentor-search';

const now = '2026-09-07T12:00:00Z';
const filters: MentorSearchFilters = { query: '', stack: null, maxPrice: null, nextSevenDays: false, sort: 'availability' };
const mentor: MentorListing = {
  id: 'alex', name: 'Alex Laurent', initials: 'AL', headline: 'TypeScript APIs', introduction: 'Bring a small code example.',
  stacks: ['TypeScript', 'React'], topics: ['Testing', 'API design'], languages: ['English'], timeZone: 'Europe/Warsaw',
  price25: 180, price50: 360, averageRating: 4.7, reviewCount: 3, nextAvailableAt: '2026-09-08T12:00:00Z',
};

it('searches every query term across names, technologies, introductions, headlines and topics without case or accent sensitivity', () => {
  const eloise = { ...mentor, id: 'eloise', name: 'Éloïse Łukasik', headline: 'Python developer', introduction: 'Bring your data.', stacks: ['Python'], topics: ['Data modelling'] };
  const mentors = [mentor, eloise];
  expect(searchMentors(mentors, { ...filters, query: '  ELOISE\n  lukasik   data  ' }, now)).toEqual([eloise]);
  expect(searchMentors(mentors, { ...filters, query: 'react api' }, now)).toEqual([mentor]);
  expect(searchMentors(mentors, { ...filters, query: 'small example' }, now)).toEqual([mentor]);
  expect(searchMentors(mentors, { ...filters, query: 'eloise typescript' }, now)).toEqual([]);
  expect(searchMentors(mentors, { ...filters, query: ' \n ' }, now)).toHaveLength(2);
});

it('combines technology and inclusive per-25-minute price limits', () => {
  const cheaper = { ...mentor, id: 'sam', price25: 90, stacks: ['Python'] };
  const expensive = { ...mentor, id: 'lee', price25: 181 };
  const mentors = [mentor, cheaper, expensive];
  expect(searchMentors(mentors, { ...filters, stack: 'React', maxPrice: 180 }, now)).toEqual([mentor]);
  expect(searchMentors(mentors, { ...filters, maxPrice: 90 }, now)).toEqual([cheaper]);
  expect(searchMentors(mentors, { ...filters, stack: 'Rust' }, now)).toEqual([]);
});

it('recognizes common technology abbreviations while retaining ordinary search terms', () => {
  const javascript = { ...mentor, id: 'javascript', headline: 'JavaScript APIs', stacks: ['JavaScript', 'Node.js'], introduction: 'Debug a constructor or an async task.' };
  expect(searchMentors([mentor, javascript], { ...filters, query: 'TS' }, now)).toEqual([mentor]);
  expect(searchMentors([mentor, javascript], { ...filters, query: 'js nodejs' }, now)).toEqual([javascript]);
  expect(searchMentors([mentor, javascript], { ...filters, query: 'node constructor' }, now)).toEqual([javascript]);
});

it('includes upcoming slots at both seven-day boundaries and rejects past, missing and malformed times', () => {
  const atStart = { ...mentor, id: 'start', nextAvailableAt: now };
  const atEnd = { ...mentor, id: 'end', nextAvailableAt: '2026-09-14T12:00:00Z' };
  const later = { ...mentor, id: 'later', nextAvailableAt: '2026-09-14T12:00:01Z' };
  const past = { ...mentor, id: 'past', nextAvailableAt: '2026-09-07T11:59:59Z' };
  const missing = { ...mentor, id: 'missing', nextAvailableAt: null };
  const malformed = { ...mentor, id: 'malformed', nextAvailableAt: 'not a date' };
  expect(searchMentors([later, past, missing, malformed, atEnd, atStart], { ...filters, nextSevenDays: true }, now)).toEqual([atStart, atEnd]);
  expect(upcomingTime(missing, now)).toBe(Infinity);
  expect(upcomingTime(malformed, now)).toBe(Infinity);
  expect(upcomingTime(past, now)).toBe(Infinity);
  expect(upcomingTime(mentor, 'invalid clock')).toBe(Infinity);
  expect(searchMentors([mentor], { ...filters, nextSevenDays: true }, 'invalid clock')).toEqual([]);
});

it('sorts by the visible criterion with name and ID tie-breaks without mutating the input', () => {
  const second = { ...mentor, id: 'second', name: 'Blair', price25: 100 };
  const duplicateName = { ...second, id: 'third' };
  const noSlots = { ...mentor, id: 'none', name: 'Zoe', nextAvailableAt: null, price25: 90 };
  const noSlotsEarlierName = { ...noSlots, id: 'none-a', name: 'Ada', price25: 500 };
  const first = { ...mentor, id: 'first', name: 'Camille', nextAvailableAt: now, price25: 250 };
  const mentors = [noSlots, duplicateName, first, noSlotsEarlierName, second];
  expect(searchMentors(mentors, filters, now).map(result => result.id)).toEqual(['first', 'second', 'third', 'none-a', 'none']);
  expect(searchMentors(mentors, { ...filters, sort: 'price' }, now).map(result => result.id)).toEqual(['none', 'second', 'third', 'first', 'none-a']);
  expect(mentors.map(result => result.id)).toEqual(['none', 'third', 'first', 'none-a', 'second']);
});

it('derives unique sorted technology choices and labels slots in the mentor timezone', () => {
  expect(mentorTechnologies([mentor, { ...mentor, stacks: ['React', 'Python'] }])).toEqual(['Python', 'React', 'TypeScript']);
  expect(mentorTechnologies([])).toEqual([]);
  expect(availableTimeLabel(mentor, now)).toBe('Tue 8 Sept, 14:00 CEST');
  expect(availableTimeLabel({ ...mentor, nextAvailableAt: null }, now)).toBeNull();
});
