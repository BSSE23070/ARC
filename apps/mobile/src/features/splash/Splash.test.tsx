import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { Splash } from './Splash';

const app = <Text>the app</Text>;

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('shows the app straight away when the animation is not played', async () => {
  await render(<Splash play={false}>{app}</Splash>);
  expect(screen.getByText('the app')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Arc is opening')).toBeNull();
});

it('hides the app from screen readers while playing, then hands over to it', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await render(<Splash play>{app}</Splash>);

  expect(screen.getByLabelText('Arc is opening')).toBeOnTheScreen();
  expect(screen.queryByText('the app')).toBeNull(); // mounted, but hidden from accessibility

  await act(async () => {
    await jest.advanceTimersByTimeAsync(7500);
  });
  expect(screen.getByText('the app')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Arc is opening')).toBeNull();
});

it('skips the animation for people who have turned motion off', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await render(<Splash play>{app}</Splash>);
  expect(await screen.findByText('the app')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Arc is opening')).toBeNull();
});
