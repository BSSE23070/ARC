import { fireEvent, render, screen } from '@testing-library/react-native';
import { Mail } from 'lucide-react-native';

import { Button, initialsOf, OtpInput, StateView, TextField } from './index';

describe('Button', () => {
  it('calls onPress and exposes its label to screen readers', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send code" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cannot be pressed while loading or disabled', async () => {
    const onPress = jest.fn();
    const view = await render(<Button label="Verify" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByRole('button', { name: 'Verify' })).toBeBusy();

    await view.rerender(<Button label="Verify" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('OtpInput', () => {
  it('keeps digits only and reports the finished code once', async () => {
    const onChange = jest.fn();
    const onComplete = jest.fn();
    await render(<OtpInput value="" onChange={onChange} onComplete={onComplete} autoFocus={false} />);

    await fireEvent.changeText(screen.getByTestId('otp-input'), '48a2');
    expect(onChange).toHaveBeenLastCalledWith('482');
    expect(onComplete).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('otp-input'), '482 193 77');
    expect(onChange).toHaveBeenLastCalledWith('482193');
    expect(onComplete).toHaveBeenCalledWith('482193');
  });

  it('shows each entered digit in its own cell', async () => {
    await render(<OtpInput value="4821" onChange={() => undefined} autoFocus={false} />);
    for (const digit of ['4', '8', '2', '1']) expect(screen.getByText(digit)).toBeOnTheScreen();
  });
});

describe('TextField', () => {
  it('is found by its label and shows an error instead of the hint', async () => {
    const onChangeText = jest.fn();
    const view = await render(
      <TextField label="Email" icon={Mail} value="" onChangeText={onChangeText} hint="We never share it." />,
    );
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maryam@itu.edu.pk');
    expect(onChangeText).toHaveBeenCalledWith('maryam@itu.edu.pk');
    expect(screen.getByText('We never share it.')).toBeOnTheScreen();

    await view.rerender(
      <TextField label="Email" value="" onChangeText={onChangeText} hint="We never share it." error="Enter a valid email address." />,
    );
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(screen.queryByText('We never share it.')).toBeNull();
  });

  it('hides a password until the user asks to see it', async () => {
    await render(<TextField label="Password" value="hunter2hunter2" onChangeText={() => undefined} secure />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeOnTheScreen();
  });
});

describe('StateView', () => {
  it('renders the title as a heading with its message', async () => {
    await render(<StateView icon={Mail} title="Something went wrong" message="Try again." />);
    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.getByText('Try again.')).toBeOnTheScreen();
  });
});

describe('initialsOf', () => {
  it.each([
    ['maryam', 'M'],
    ['maryam_t', 'MT'],
    ['Maryam Tariq', 'MT'],
    ['a.b.c', 'AB'],
  ])('%s -> %s', (name, initials) => expect(initialsOf(name)).toBe(initials));
});
