// Quest templates used by the local recommender and planner. d = difficulty 1..5, m = minutes.
// Kept deliberately healthy: fitness tops out at moderate sessions, nothing rewards skipping sleep.

export const TEMPLATES = {
  programming: [
    { d: 1, m: 10, t: 'Read one function you did not write', c: 'You can explain what it does in one sentence.' },
    { d: 2, m: 25, t: 'Solve one small coding exercise', c: 'Solution runs and passes its examples.' },
    { d: 3, m: 45, t: 'Write tests for an untested piece of code', c: 'At least 3 tests run and pass.' },
    { d: 4, m: 90, t: 'Build a small feature end to end', c: 'Feature works and is committed.' },
    { d: 5, m: 150, t: 'Ship a mini project and write its README', c: 'Someone else could run it from the README.' },
  ],
  fitness: [
    { d: 1, m: 10, t: 'Take a 10-minute walk', c: 'Walked at an easy pace for 10 minutes.' },
    { d: 2, m: 20, t: 'Do a 20-minute mobility routine', c: 'Completed the routine without pain.' },
    { d: 3, m: 30, t: 'Complete a 30-minute moderate workout', c: 'Finished with a warm-up and cool-down.' },
    { d: 4, m: 45, t: 'Try a slightly longer session than last week', c: 'About 10% more than last week, stopped before exhaustion.' },
    { d: 5, m: 60, t: 'Complete a planned training session', c: 'Followed the plan; skip it if you are sick or under-slept.' },
  ],
  learning: [
    { d: 1, m: 10, t: 'Write 3 things you learned recently', c: 'Three bullet points written down.' },
    { d: 2, m: 25, t: 'Study one focused topic for 25 minutes', c: 'One distraction-free session with notes.' },
    { d: 3, m: 45, t: 'Summarise a chapter or lecture in your own words', c: 'A summary you could teach from.' },
    { d: 4, m: 75, t: 'Do practice problems on a topic you find hard', c: 'Checked your answers and noted mistakes.' },
    { d: 5, m: 120, t: 'Teach a topic: write or record an explainer', c: 'A finished explainer someone could learn from.' },
  ],
  creativity: [
    { d: 1, m: 10, t: 'Sketch or jot one idea', c: 'One idea captured on paper or in notes.' },
    { d: 2, m: 25, t: 'Make something small in 25 minutes', c: 'A finished (imperfect) small piece.' },
    { d: 3, m: 45, t: 'Recreate a work you admire to study it', c: 'Noted two techniques you learned.' },
    { d: 4, m: 90, t: 'Finish a piece you started earlier', c: 'The piece is complete and saved.' },
    { d: 5, m: 150, t: 'Share a finished piece and ask for feedback', c: 'Shared with at least one person.' },
  ],
  communication: [
    { d: 1, m: 5, t: 'Send a thoughtful message to someone', c: 'Message sent.' },
    { d: 2, m: 20, t: 'Have a real conversation without your phone', c: 'Listened more than you spoke.' },
    { d: 3, m: 30, t: 'Write a clear one-page explanation of something', c: 'Someone else understood it.' },
    { d: 4, m: 45, t: 'Practise a short talk out loud', c: 'Delivered it start to finish twice.' },
    { d: 5, m: 90, t: 'Present or lead a discussion', c: 'Done, and you noted one thing to improve.' },
  ],
  finance: [
    { d: 1, m: 10, t: 'Log today’s spending', c: 'Every purchase today is written down.' },
    { d: 2, m: 25, t: 'Review last week’s spending', c: 'Found one category to adjust.' },
    { d: 3, m: 45, t: 'Build or update a monthly budget', c: 'Budget covers income, bills and savings.' },
    { d: 4, m: 60, t: 'Learn one investing or saving concept', c: 'You can explain it and its risks.' },
    { d: 5, m: 120, t: 'Create a 6-month savings plan', c: 'Plan has monthly targets and an emergency fund.' },
  ],
  problem: [
    { d: 1, m: 10, t: 'Solve a logic puzzle', c: 'Puzzle solved without looking it up.' },
    { d: 2, m: 25, t: 'Break a messy problem into steps', c: 'Written list of concrete next steps.' },
    { d: 3, m: 45, t: 'Debug or fix something that has been broken', c: 'It works now and you know why it broke.' },
    { d: 4, m: 75, t: 'Compare three solutions to a real problem', c: 'Pros and cons written for each.' },
    { d: 5, m: 120, t: 'Solve a hard challenge problem', c: 'Solved and verified.' },
  ],
  discipline: [
    { d: 1, m: 5, t: 'Plan tomorrow in 5 minutes', c: 'Top three tasks written down.' },
    { d: 2, m: 15, t: 'Tidy your workspace', c: 'Desk is clear and ready.' },
    { d: 3, m: 30, t: 'Do the task you have been avoiding', c: 'The avoided task is done or meaningfully started.' },
    { d: 4, m: 60, t: 'Complete a focused work block without distractions', c: 'Phone away, one task, full block.' },
    { d: 5, m: 90, t: 'Do a weekly review and reset', c: 'Reviewed goals, calendar and open loops.' },
  ],
};

export function genericTemplates(skillName) {
  return [
    { d: 1, m: 10, t: `Spend 10 minutes on ${skillName}`, c: 'Ten focused minutes logged.' },
    { d: 2, m: 25, t: `Practise one ${skillName} basic`, c: 'One basic exercise completed.' },
    { d: 3, m: 45, t: `Work on a ${skillName} technique you find hard`, c: 'Noticeable improvement or notes on what blocks you.' },
    { d: 4, m: 75, t: `Make something with ${skillName}`, c: 'A finished result you can show.' },
    { d: 5, m: 120, t: `Take on a ${skillName} challenge`, c: 'Challenge completed and reviewed.' },
  ];
}

export const templatesFor = (skill) => TEMPLATES[skill.id] || genericTemplates(skill.name);
