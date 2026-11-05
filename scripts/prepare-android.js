const fs = require('fs');
const path = require('path');

function replaceAll(file, replacements) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  const original = text;
  replacements.forEach(([from, to]) => {
    text = text.split(from).join(to);
  });
  if (text !== original) fs.writeFileSync(file, text);
}

const root = path.join(__dirname, '..');

replaceAll(path.join(root, 'android/capacitor-cordova-android-plugins/build.gradle'), [
  ["google()\n        jcenter()", "google()\n        mavenCentral()"],
  ["classpath 'com.android.tools.build:gradle:3.6.1'", "classpath 'com.android.tools.build:gradle:7.4.2'"],
  ["google()\n    jcenter()\n    mavenCentral()", "google()\n    mavenCentral()"],
  [
    'targetSdkVersion targetSdkVersion = project.hasProperty(\'targetSdkVersion\') ? rootProject.ext.targetSdkVersion : 29',
    'targetSdkVersion project.hasProperty(\'targetSdkVersion\') ? rootProject.ext.targetSdkVersion : 29'
  ],
  [
    "android {\n    compileSdkVersion project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 29",
    "android {\n    namespace \"capacitor.android.plugins\"\n    compileSdkVersion project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 29"
  ]
]);

replaceAll(path.join(root, 'node_modules/@capacitor/android/capacitor/build.gradle'), [
  ["google()\n        jcenter()", "google()\n        mavenCentral()"],
  ["classpath 'com.android.tools.build:gradle:3.6.1'", "classpath 'com.android.tools.build:gradle:7.4.2'"],
  ["google()\n    jcenter()\n    mavenCentral()", "google()\n    mavenCentral()"],
  [
    "android {\n    compileSdkVersion project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 29",
    "android {\n    namespace \"com.getcapacitor.android\"\n    compileSdkVersion project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 29"
  ]
]);

replaceAll(path.join(root, 'node_modules/@capacitor/android/capacitor/src/main/AndroidManifest.xml'), [
  [
    '<receiver android:name="com.getcapacitor.plugin.notification.TimedNotificationPublisher" />',
    '<receiver android:name="com.getcapacitor.plugin.notification.TimedNotificationPublisher" android:exported="false" />'
  ],
  [
    '<receiver android:name="com.getcapacitor.plugin.notification.NotificationDismissReceiver" />',
    '<receiver android:name="com.getcapacitor.plugin.notification.NotificationDismissReceiver" android:exported="false" />'
  ],
  [
    '<service android:name="com.getcapacitor.CapacitorFirebaseMessagingService" android:stopWithTask="false">',
    '<service android:name="com.getcapacitor.CapacitorFirebaseMessagingService" android:stopWithTask="false" android:exported="false">'
  ]
]);

replaceAll(
  path.join(root, 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/cordova/MockCordovaInterfaceImpl.java'),
  [
    [
      'import android.app.Activity;\n\nimport org.apache.cordova.CordovaInterfaceImpl;',
      'import android.app.Activity;\n\nimport androidx.appcompat.app.AppCompatActivity;\n\nimport org.apache.cordova.CordovaInterfaceImpl;'
    ],
    [
      '    super(activity, Executors.newCachedThreadPool());',
      '    super((AppCompatActivity) activity, Executors.newCachedThreadPool());'
    ]
  ]
);

replaceAll(
  path.join(root, 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java'),
  [
    ['    settings.setDatabaseEnabled(true);\n    settings.setAppCacheEnabled(true);\n', '    settings.setDatabaseEnabled(true);\n']
  ]
);

console.log('Android Gradle/Capacitor patches applied.');
