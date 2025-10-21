import { join } from 'node:path';
import { OPTIONS } from './options';

const LOCAL_DOCS = [
  `[@patternfly/react-charts](${join(OPTIONS.docsPath, 'charts', 'README.md')})`,
  `[@patternfly/react-chatbot](${join(OPTIONS.docsPath, 'chatbot', 'README.md')})`,
  `[@patternfly/react-component-groups](${join(OPTIONS.docsPath, 'component-groups', 'README.md')})`,
  `[@patternfly/react-components](${join(OPTIONS.docsPath, 'components', 'README.md')})`,
  `[@patternfly/react-guidelines](${join(OPTIONS.docsPath, 'guidelines', 'README.md')})`,
  `[@patternfly/react-resources](${join(OPTIONS.docsPath, 'resources', 'README.md')})`,
  `[@patternfly/react-setup](${join(OPTIONS.docsPath, 'setup', 'README.md')})`,
  `[@patternfly/react-troubleshooting](${join(OPTIONS.docsPath, 'troubleshooting', 'README.md')})`
];

export { LOCAL_DOCS };
