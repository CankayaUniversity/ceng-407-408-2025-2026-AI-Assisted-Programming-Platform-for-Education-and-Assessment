import { useMemo, useState } from "react";
import { Box, Stack } from "@mui/material";

import AppLayout from "../layout/AppLayout";
import ExamModeCard from "./ExamModeCard";
import QuestionBankPanel from "./QuestionBankPanel";
import StudentProgressTable from "./StudentProgressTable";

const MOCK_STUDENTS = [
  { id: 1, name: 'Sarah Johnson', email: 'sarah.j@school.edu', completed: 17, total: 20, progress: 85 },
  { id: 2, name: 'Michael Chen', email: 'michael.c@school.edu', completed: 18, total: 20, progress: 92 },
  { id: 3, name: 'Emma Davis', email: 'emma.d@school.edu', completed: 13, total: 20, progress: 67 },
  { id: 4, name: 'James Wilson', email: 'james.w@school.edu', completed: 15, total: 20, progress: 74 },
  { id: 5, name: 'Olivia Martinez', email: 'olivia.m@school.edu', completed: 18, total: 20, progress: 89 },
  { id: 6, name: 'Noah Anderson', email: 'noah.a@school.edu', completed: 11, total: 20, progress: 56 },
];

const MOCK_QUESTION_BANK = [
  {
    id: 101,
    title: 'Two Sum',
    difficulty: 'Easy',
    topic: 'Arrays',
    usageCount: 245,
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    example: ['Input: nums = [2,7,11,15], target = 9', 'Output: [0,1]'],
  },
  {
    id: 102,
    title: 'Reverse Linked List',
    difficulty: 'Medium',
    topic: 'Linked Lists',
    usageCount: 189,
    description: 'Reverse a singly linked list and return the new head of the list.',
    example: ['Input: head = [1,2,3,4,5]', 'Output: [5,4,3,2,1]'],
  },
  {
    id: 103,
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    topic: 'Stacks',
    usageCount: 312,
    description: 'Given a string containing brackets, determine whether the input string is valid.',
    example: ['Input: s = "()[]{}"', 'Output: true'],
  },
];

function buildQuestionBankItems(problems = []) {
  if (!problems.length) return MOCK_QUESTION_BANK;

  return problems.map((problem, index) => ({
    id: problem.id ?? index + 1,
    title: problem.title ?? `Problem ${index + 1}`,
    difficulty: problem.difficulty ?? (index % 2 === 0 ? 'Easy' : 'Medium'),
    topic: problem.topic ?? problem.category ?? ['Arrays', 'Linked Lists', 'Stacks'][index % 3],
    usageCount: 140 + index * 37,
    description:
      problem.description ??
      'Teacher-authored problem description will appear here. This is mock content for the visual skeleton.',
    example: problem.example ?? ['Input: ...', 'Output: ...'],
  }));
}

const TEACHER_NAV = [
  { label: 'Class Analytics', active: false },
  { label: 'Question Bank', active: false },
  { label: 'Settings', active: false },
];

export default function TeacherDashboard({ currentUser, problems, handleLogout }) {
  const [examMode, setExamMode] = useState(false);
  const questionBankItems = useMemo(() => buildQuestionBankItems(problems), [problems]);

  return (
    <AppLayout
      title="AI Mentor"
      userLabel={currentUser?.name || currentUser?.email || 'Teacher'}
      onLogout={handleLogout}
      navItems={TEACHER_NAV}
      maxWidth="xl"
      headerVariant="teacher"
      roleLabel="Teacher" 
      showPageTitle={false}
    >
      <Stack spacing={3.25}>
        <ExamModeCard examMode={examMode} onToggle={setExamMode} />

        <StudentProgressTable students={MOCK_STUDENTS} />

        <QuestionBankPanel items={questionBankItems} />
      </Stack>
    </AppLayout>
  );
}
