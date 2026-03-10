import { createTheme } from '@mui/material/styles';
import { defaultTheme } from 'react-admin';

const redCrossRed = '#ED1B24';
const redCrossRedDark = '#B01218';

export const theme = createTheme({
  ...defaultTheme,
  palette: {
    primary: {
      main: redCrossRed,
      dark: redCrossRedDark,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: redCrossRedDark,
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F5F5F5',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: redCrossRed,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          '&:hover': {
            backgroundColor: redCrossRedDark,
          },
        },
      },
    },
  },
});
