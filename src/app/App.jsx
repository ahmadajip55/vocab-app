import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { ProgramsProvider } from '../features/vocabulary/VocabularyProvider.jsx';
import HomePage from '../pages/HomePage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import ProgramPickerPage from '../pages/ProgramPickerPage.jsx';
import ProgramRoute from '../pages/ProgramRoute.jsx';
import { PROGRAM_SECTIONS } from './sections.js';

// Heavier screens load on demand, so the first paint stays small.
const WordsPage = lazy(() => import('../pages/WordsPage.jsx'));
const ImportPage = lazy(() => import('../pages/ImportPage.jsx'));
const FlashcardsPage = lazy(() => import('../pages/FlashcardsPage.jsx'));
const QuizPage = lazy(() => import('../pages/QuizPage.jsx'));
const BackupPage = lazy(() => import('../pages/BackupPage.jsx'));

const PAGES = { words: WordsPage, import: ImportPage, flashcards: FlashcardsPage, quiz: QuizPage };

export default function App() {
  return (
    <BrowserRouter>
      <ProgramsProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            {PROGRAM_SECTIONS.flatMap((section) => {
              const Page = PAGES[section.path];
              return [
                <Route key={section.path} path={section.path} element={<ProgramPickerPage section={section} />} />,
                <Route
                  key={`${section.path}/id`}
                  path={`${section.path}/:programId`}
                  element={
                    <ProgramRoute section={section.path}>
                      <Page />
                    </ProgramRoute>
                  }
                />,
                <Route key={section.alias} path={section.alias} element={<Navigate to={`/${section.path}`} replace />} />,
              ];
            })}
            <Route path="backup" element={<BackupPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </ProgramsProvider>
    </BrowserRouter>
  );
}
